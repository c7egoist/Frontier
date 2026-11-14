// Virtual Geometry Editor — app shell. Owns the camera, settings, build workers, renderer
// selection (WebGL2 CPU-cut path / WebGPU compute-cull path), and every panel of the UI.

import { ViewCamera } from "./Engine/ViewCamera.js";
import { VirtualGeometryScene, AssetDefinitions, LayoutPresets, ConstructDefaultSettings } from "./Engine/VirtualGeometryScene.js";
import { WebGl2Rasterization, DebugViews } from "./Engine/WebGl2Rasterization.js";
import { WebGpuClusterRasterization } from "./Engine/WebGpuClusterRasterization.js";
import { DecodeWavefrontText } from "./Engine/PolygonNetworkSources.js";
import { InvertTransform, TransformPoint, Clamp } from "./Engine/LinearAlgebra.js";

const Query = (Id) => document.getElementById(Id);
const Format = (N) => (N >= 1e9 ? (N / 1e9).toFixed(2) + "B" : N >= 1e6 ? (N / 1e6).toFixed(2) + "M" : N >= 1e4 ? (N / 1e3).toFixed(1) + "k" : Math.round(N).toLocaleString());
const FormatBytes = (B) => (B >= 1 << 20 ? (B / (1 << 20)).toFixed(1) + " MB" : (B / 1024).toFixed(0) + " KB");
const LevelPalette = ["#3373ff", "#1ab8f2", "#1ad9b2", "#40d959", "#99e033", "#ebe02e", "#ffb226", "#ff801f", "#f24738", "#e0387a", "#b840cc", "#ebe0f5"];
const LevelSwatch = (Level) => LevelPalette[Math.min(Level, LevelPalette.length - 1)];
const DebugViewHints = {
    Lit: "Shaded material.",
    Clusters: "Every cluster (≤128 triangles) in a hashed colour.",
    Groups: "The cluster group each cluster was simplified with. Group borders are locked during simplification, which is what keeps neighbouring LODs crack-free.",
    Level: "DAG level of each drawn cluster: blue is the source, warmer colours are coarser.",
    Triangles: "Individual triangles: shows how dense the selected cut is on screen.",
    Error: "Projected error ÷ threshold. Green to yellow means within budget; red would be a visible error.",
    Instances: "One colour per instance.",
    Normals: "World-space shading normals.",
};

const Icons = {
    boulder: '<path d="M4 18 3 11l4-6 7-1 6 5 1 7-5 4H8z"/><path d="m7 5 2 6-6 0M9 11l5 2 7 3M14 13l-2 8"/>',
    terrain: '<path d="M2 19 8 9l4 6 3-4 7 8z"/><path d="m8 9 2 3"/>',
    knot: '<path d="M8 6c4-3 10 0 9 5s-7 7-10 4 0-9 5-9 7 6 3 10-10 2-10-3 4-7 8-6"/>',
    column: '<path d="M6 3h12M7 21h10M8 3v18M12 3v18M16 3v18M5 21h14"/>',
    import: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
const SvgIcon = (Paths, Size = 14) => `<svg class="Icon" viewBox="0 0 24 24" width="${Size}" height="${Size}" aria-hidden="true">${Paths}</svg>`;

class VirtualGeometryEditor {
    constructor() {
        this.Settings = ConstructDefaultSettings();
        this.BuildOptions = { ClusterSize: 128, GroupSize: 8 };
        this.Camera = new ViewCamera();
        this.Scene = new VirtualGeometryScene();
        this.Viewport = Query("Viewport");
        this.GlCanvas = Query("GlCanvas");
        this.GpuCanvas = Query("GpuCanvas");
        this.Backend = "WebGL2";
        this.Picked = null;
        this.Keys = new Set();
        this.History = [];
        this.LastTick = performance.now();
        this.FrameMilliseconds = 16;
        this.PendingBuilds = new Map();
        this.RequestCounter = 0;
        this.Workers = [];
        this.WorkerQueue = [];
        this.UiRefreshAt = 0;
        this.Selected = { Category: "Scene" };
        this.ExpandedCollections = new Set(["Assets"]);
    }

    async Start() {
        this.GpuAvailable = WebGpuClusterRasterization.Probe();
        const Requested = new URLSearchParams(location.search).get("backend");
        if (Requested && Requested.toLowerCase() === "webgpu" && this.GpuAvailable) {
            try {
                await this.ConstructGpu();
                this.Backend = "WebGPU";
                this.Settings.Mode = "Cluster";
                this.GlCanvas.hidden = true;
                this.GpuCanvas.hidden = false;
            } catch (Failure) {
                console.error(Failure);
                this.Gpu = null;
            }
        }
        if (this.Backend === "WebGL2" && !this.EnsureGl()) return;
        this.ConstructNotch();
        this.ConstructInspector();
        this.ConstructDrawer();
        this.ConstructTabs();
        this.ConstructInput();
        this.ConstructSplit();
        this.ApplyModeButtons();
        new ResizeObserver(() => this.ResizeCanvas()).observe(this.Viewport);
        this.ResizeCanvas();
        this.Scene.ApplyLayout("BoulderField");
        this.Camera.Yaw = 0.75; this.Camera.Pitch = 0.36;
        await this.BuildMissingAssets();
        this.FrameScene();
        requestAnimationFrame((Now) => this.Tick(Now));
        window.VirtualGeometryEditor = this; // inspection handle for tests
    }

    // ---------------------------------------------------------------- building
    EnsureWorkers() {
        const Count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 0));
        while (this.Workers.length < Count) {
            const Worker = new window.Worker(new URL("./Engine/HierarchyBuildWorker.js", import.meta.url), { type: "module" });
            Worker.Busy = false;
            Worker.onmessage = (Message) => this.ReceiveWorkerMessage(Worker, Message.data);
            Worker.onerror = (Failure) => {
                const Request = this.PendingBuilds.get(Worker.RequestId);
                if (Request) { this.PendingBuilds.delete(Worker.RequestId); Request.Reject(new Error(Failure.message || "Worker failed to load")); }
                Worker.Busy = false;
                this.DispatchWorkers();
            };
            this.Workers.push(Worker);
        }
    }

    RequestBuild(Message, Label) {
        this.EnsureWorkers();
        return new Promise((Resolve, Reject) => {
            const RequestId = ++this.RequestCounter;
            this.PendingBuilds.set(RequestId, { Resolve, Reject, Label, Phase: "Queued", Fraction: 0 });
            this.WorkerQueue.push({ ...Message, RequestId });
            this.DispatchWorkers();
            this.RefreshProgress();
        });
    }

    DispatchWorkers() {
        for (const Worker of this.Workers) {
            if (Worker.Busy || !this.WorkerQueue.length) continue;
            const Message = this.WorkerQueue.shift();
            Worker.Busy = true;
            Worker.RequestId = Message.RequestId;
            Worker.postMessage(Message);
        }
    }

    ReceiveWorkerMessage(Worker, Message) {
        const Request = this.PendingBuilds.get(Message.RequestId);
        if (!Request) return;
        if (Message.Progress) {
            Request.Phase = Message.Progress.Phase;
            Request.Fraction = Message.Progress.Fraction;
            this.RefreshProgress();
            return;
        }
        this.PendingBuilds.delete(Message.RequestId);
        Worker.Busy = false;
        this.DispatchWorkers();
        if (Message.Failure) Request.Reject(new Error(Message.Failure));
        else Request.Resolve(Message.Asset);
        this.RefreshProgress();
    }

    RefreshProgress() {
        const Requests = [...this.PendingBuilds.values()];
        const Veil = Query("ProgressVeil");
        if (!Requests.length) { Veil.hidden = true; this.SetStatus("Ready", false); return; }
        Veil.hidden = !this.ShowVeil;
        const Fraction = Requests.reduce((Sum, R) => Sum + R.Fraction, 0) / Math.max(1, this.BuildBatchSize || Requests.length) + (1 - Requests.length / Math.max(1, this.BuildBatchSize || Requests.length));
        Query("ProgressFill").style.width = `${Math.round(Clamp(Fraction, 0, 1) * 100)}%`;
        Query("ProgressLog").innerHTML = Requests.map((R) => `${R.Label} — ${R.Phase} ${Math.round(R.Fraction * 100)}%`).join("<br>");
        this.SetStatus(`Building ${Requests.map((R) => R.Label).join(", ")}…`, true);
    }

    async BuildAssets(Definitions, { Veil = true } = {}) {
        if (!Definitions.length) return;
        this.ShowVeil = Veil;
        this.BuildBatchSize = Definitions.length;
        Query("ProgressTitle").textContent = `Building ${Definitions.length} cluster DAG${Definitions.length > 1 ? "s" : ""} in ${Math.min(Definitions.length, this.Workers.length || navigator.hardwareConcurrency || 2)} worker(s)…`;
        const Results = await Promise.allSettled(Definitions.map((Definition) => this.RequestBuild({
            Generator: Definition.Generator, GeneratorOptions: Definition.GeneratorOptions, Source: Definition.Source || null, BuildOptions: this.BuildOptions,
        }, Definition.Label).then((Asset) => ({ Definition, Asset }))));
        for (const Result of Results) {
            if (Result.status === "fulfilled") {
                this.Scene.RegisterAsset(Result.value.Definition.Key, Result.value.Asset);
                console.info(`[VirtualGeometry] ${Result.value.Asset.Label}: ${Result.value.Asset.Log.join(" | ")}`);
            } else {
                console.error(Result.reason);
                this.ShowToast(`Build failed: ${String(Result.reason.message).split("\n")[0]}`);
            }
        }
        this.BuildBatchSize = 0;
        this.UploadAll();
    }

    async BuildMissingAssets() {
        const Missing = this.Scene.MissingAssets().map((Key) => this.ResolveDefinition(Key)).filter(Boolean);
        await this.BuildAssets(Missing);
        this.Scene.RebuildInstances();
        this.InstancesChanged();
    }

    ResolveDefinition(Key) {
        return AssetDefinitions.find((Definition) => Definition.Key === Key) || (this.ImportedDefinitions || []).find((Definition) => Definition.Key === Key);
    }

    UploadAll() {
        const Assets = [...this.Scene.Assets.values()];
        if (this.Gl) this.Gl.UploadAssets(Assets);
        if (this.Gpu && !this.Gpu.Lost) this.Gpu.UploadAssets(Assets);
        this.Picked = null;
        this.RefreshDrawer();
        this.RefreshBuildPanel();
        this.RefreshLevelsPanel();
    }

    InstancesChanged() {
        if (this.Gl) this.Gl.DiscardOcclusionQueries();
        if (this.Gpu && !this.Gpu.Lost) this.Gpu.UploadInstances(this.Scene.ConstructGpuInstanceRecords());
        this.Picked = null;
        this.RefreshOutliner();
        this.RefreshInspectorSelection();
        this.RefreshDrawer();
    }

    async RebuildAll() {
        const Definitions = [...this.Scene.Assets.keys()].map((Key) => this.ResolveDefinition(Key)).filter(Boolean);
        await this.BuildAssets(Definitions);
        this.Scene.RebuildInstances();
        this.InstancesChanged();
        this.ShowToast(`Rebuilt with ${this.BuildOptions.ClusterSize}-triangle clusters, groups of ${this.BuildOptions.GroupSize}`);
    }

    async ImportWavefront(File) {
        const Text = await File.text();
        let Source;
        try { Source = DecodeWavefrontText(Text, File.name.replace(/\.obj$/i, "")); } catch (Failure) { this.ShowToast(`Import failed: ${Failure.message}`); return; }
        if (!Source.Indices.length) { this.ShowToast("Import failed: no triangles found"); return; }
        const Key = `Import${(this.ImportedDefinitions || []).length + 1}`;
        const Definition = { Key, Label: Source.Label, Source, Albedo: [0.62, 0.6, 0.58], Roughness: 0.55, Icon: "import" };
        (this.ImportedDefinitions ||= []).push(Definition);
        await this.BuildAssets([Definition]);
        if (!this.Scene.Assets.has(Key)) return;
        // Normalise placement: a grid of the imported asset sized to its bounding sphere.
        const Radius = this.Scene.Assets.get(Key).AssetSphere[3];
        this.Scene.Layout = { Key: "Imported", Label: `Imported · ${Source.Label}`, Assets: [Key], Rows: 6, Spacing: Radius * 2.6, ScaleMin: 1, ScaleMax: 1, Seed: 1, Ground: true };
        this.Scene.RebuildInstances();
        this.InstancesChanged();
        this.FrameScene();
        this.ShowToast(`Imported ${Source.Label}: ${Format(Source.Indices.length / 3)} triangles`);
    }

    // ---------------------------------------------------------------- backend
    // WebGL2 is created lazily so a WebGPU-first session (?backend=webgpu) never holds two GPU contexts.
    EnsureGl() {
        if (this.Gl) return true;
        try {
            this.Gl = new WebGl2Rasterization(this.GlCanvas);
            this.Gl.UploadAssets([...this.Scene.Assets.values()]);
            return true;
        } catch (Failure) {
            this.ReportFatal(`WebGL2 is required for this backend: ${Failure.message}`);
            return false;
        }
    }

    async ConstructGpu() {
        this.Gpu = await WebGpuClusterRasterization.Create(this.GpuCanvas);
        const Errors = await this.Gpu.CompilationReport();
        if (Errors.length) throw new Error(Errors.join("\n"));
        this.Gpu.UploadAssets([...this.Scene.Assets.values()]);
        // ?capture=1 resolves frames offscreen (stills / headless verification).
        if (new URLSearchParams(location.search).get("capture") === "1") { this.ResizeCanvas(); this.Gpu.Resize(this.Width, this.Height); this.Gpu.EnableCapture(true); }
    }

    async SelectBackend(Backend) {
        if (Backend === this.Backend) return;
        if (Backend === "WebGPU") {
            if (!this.Gpu || this.Gpu.Lost) {
                try {
                    await this.ConstructGpu();
                } catch (Failure) {
                    console.error(Failure);
                    this.Gpu = null;
                    this.ShowToast(`WebGPU unavailable: ${String(Failure.message).split("\n")[0]}`);
                    this.RefreshBackendChips();
                    return;
                }
            }
            this.Gpu.UploadInstances(this.Scene.ConstructGpuInstanceRecords());
            if (this.Settings.Mode !== "Cluster") this.SetMode("Cluster");
        } else if (!this.EnsureGl()) return;
        this.Backend = Backend;
        this.GlCanvas.hidden = Backend !== "WebGL2";
        this.GpuCanvas.hidden = Backend !== "WebGPU";
        this.ResizeCanvas();
        this.ApplyModeButtons();
        this.RefreshBackendChips();
        this.ShowToast(Backend === "WebGPU" ? "WebGPU: cluster culling runs in a compute shader; one indirect call draws the whole cut" : "WebGL2: CPU cluster cut + multi-draw ranges");
    }

    ResizeCanvas() {
        const Rect = this.Viewport.getBoundingClientRect();
        const Ratio = Math.min(window.devicePixelRatio || 1, 2) * this.Settings.RenderScale;
        this.Width = Math.max(1, Math.round(Rect.width * Ratio));
        this.Height = Math.max(1, Math.round(Rect.height * Ratio));
        this.CssWidth = Rect.width; this.CssHeight = Rect.height;
        if (this.Backend === "WebGPU" && this.Gpu) this.Gpu.Resize(this.Width, this.Height);
        else if (this.Gl) this.Gl.Resize(this.Width, this.Height);
        this.PositionSplit();
    }

    // ---------------------------------------------------------------- per-tick
    Tick(Now) {
        const Seconds = Math.min(0.1, (Now - this.LastTick) / 1000);
        this.LastTick = Now;
        this.FrameMilliseconds = this.FrameMilliseconds * 0.92 + Seconds * 1000 * 0.08;
        this.Camera.FlyMove(this.Keys, Seconds, this.Keys.has("shift"));
        this.Camera.AdvancePath(Seconds);
        try {
            if (this.Backend === "WebGPU" && this.Gpu) this.RenderGpu();
            else if (this.Gl) this.RenderGl(Now);
        } catch (Failure) {
            console.error(Failure);
            this.ReportFatal(`Render failed: ${Failure.message}`);
            return;
        }
        requestAnimationFrame((Next) => this.Tick(Next));
        if (Now > this.UiRefreshAt) {
            this.UiRefreshAt = Now + 200;
            try { this.RefreshLiveReadouts(); } catch (Failure) { console.error(Failure); }
        }
    }

    RenderGl(Now) {
        const Prepared = this.Scene.PrepareFrame(this.Camera, this.Settings, this.Width, this.Height, this.Gl, Now, this.Picked);
        this.LastCullView = Prepared.CullView;
        this.Gl.RenderFrame(Prepared);
        const Gpu = this.Gl.QueryGpuMilliseconds();
        const S = this.Scene.Statistics;
        this.Live = {
            Triangles: S.Mode === "Discrete" ? S.DiscreteTriangles : S.ClusterTriangles,
            Clusters: S.Tally.ClustersDrawn,
            InstancesDrawn: S.InstancesDrawn, InstancesCulledFrustum: S.InstancesCulledFrustum, InstancesOccluded: S.InstancesOccluded,
            InstancesTotal: S.InstancesTotal, SourceTriangles: S.SourceTriangles, CpuMilliseconds: S.CpuMilliseconds,
            GpuMilliseconds: Gpu, Tally: S.Tally, Ranges: S.RangeCount, DiscreteTriangles: S.DiscreteTriangles, ClusterTriangles: S.ClusterTriangles,
            DiscreteLevels: S.DiscreteLevels, DiscreteSwitches: S.DiscreteSwitches, LevelClusters: S.Tally.LevelClusters, Backend: this.Gl.Label,
        };
        this.RecordHistory();
    }

    RenderGpu() {
        const Started = performance.now();
        const { RenderView, CullView } = this.Scene.ResolveViews(this.Camera, this.Settings, this.Width, this.Height);
        const ViewProjection = this.Camera.ViewProjection(this.Width / this.Height, true);
        this.LastCullView = CullView;
        const SunDirection = this.Scene.SunDirection(this.Settings);
        const Intensity = this.Settings.SunIntensity / 2.6 * 1.1;
        this.Gpu.RenderFrame({
            ViewProjection, CullView, CameraPosition: RenderView.Eye, SunDirection, SunColour: [Intensity, 0.93 * Intensity, 0.82 * Intensity],
            Settings: this.Settings, Picked: this.Picked, Lines: this.Scene.ConstructDebugLines(this.Settings, this.Picked).flatMap((Batch) => [Batch]),
            GroundHeight: this.Scene.Layout.Ground ? 0 : -6,
        });
        const G = this.Gpu.Statistics || {};
        const SourceTriangles = this.Scene.Instances.reduce((Sum, Instance) => Sum + (this.Scene.Hidden.has(Instance.AssetKey) ? 0 : this.Scene.Assets.get(Instance.AssetKey).SourceTriangleCount), 0);
        this.Live = {
            Triangles: G.TrianglesDrawn || 0, Clusters: G.ClustersDrawn || 0,
            InstancesDrawn: G.InstancesDrawn || 0, InstancesCulledFrustum: G.InstancesCulledFrustum || 0, InstancesOccluded: G.InstancesOccluded || 0,
            InstancesTotal: this.Gpu.InstanceCount || 0, SourceTriangles, CpuMilliseconds: performance.now() - Started, GpuMilliseconds: this.Gpu.QueryGpuMilliseconds(),
            Tally: { ClustersTested: (this.Gpu.InstanceCount || 0) * (this.Gpu.MaxClustersPerInstance || 0), ClustersRejectedLevel: G.ClustersRejectedLevel || 0, ClustersCulledFrustum: G.ClustersCulledFrustum || 0, ClustersCulledCone: G.ClustersCulledCone || 0, ClustersDrawn: G.ClustersDrawn || 0, NodesVisited: 0, NodesCulledFrustum: 0, NodesPrunedError: 0 },
            LevelClusters: G.LevelClusters || new Uint32Array(32), Ranges: 1, Backend: this.Gpu.Label, Overflow: G.Overflow,
            ClusterTriangles: G.TrianglesDrawn || 0, DiscreteTriangles: 0,
        };
        this.RecordHistory();
    }

    RecordHistory() {
        this.History.push({ Triangles: this.Live.Triangles, Milliseconds: this.FrameMilliseconds });
        if (this.History.length > 180) this.History.shift();
    }

    // ---------------------------------------------------------------- camera helpers
    FrameScene() {
        const Sphere = this.Scene.SceneSphere();
        this.Camera.PathSphere = Sphere;
        this.Camera.FrameSphere([Sphere[0], Sphere[1], Sphere[2], Sphere[3] * 0.62]);
        this.Camera.Far = Math.max(2000, Sphere[3] * 12);
        const View = this.Scene.Layout.View;
        if (View) Object.assign(this.Camera, { Target: View.Target.slice(), Distance: View.Distance, Yaw: View.Yaw, Pitch: View.Pitch });
    }

    FramePicked() {
        if (!this.Picked) { this.FrameScene(); return; }
        const Detail = this.Scene.DescribeCluster(this.Picked, this.LastCullView, this.Settings);
        if (!Detail) { this.FrameScene(); return; }
        const Instance = Detail.Instance;
        const F = this.Picked.Cluster * 20;
        const Center = TransformPoint(Instance.Model, Detail.Asset.ClusterFloats[F], Detail.Asset.ClusterFloats[F + 1], Detail.Asset.ClusterFloats[F + 2]);
        this.Camera.FrameSphere([Center[0], Center[1], Center[2], Math.max(Detail.Radius, 0.2) * 1.6]);
    }

    PickAt(ClientX, ClientY) {
        const Rect = this.Viewport.getBoundingClientRect();
        const X = ((ClientX - Rect.left) / Rect.width) * 2 - 1, Y = 1 - ((ClientY - Rect.top) / Rect.height) * 2;
        if (this.Settings.Mode === "Discrete") { this.ShowToast("Cluster picking needs Cluster DAG or Compare mode"); return; }
        const Inverse = InvertTransform(this.Camera.ViewProjection(this.Width / this.Height));
        const Near = TransformPoint(Inverse, X, Y, -1), Far = TransformPoint(Inverse, X, Y, 1);
        const Direction = [Far[0] - Near[0], Far[1] - Near[1], Far[2] - Near[2]];
        const Length = Math.hypot(...Direction);
        const Hit = this.Scene.RayPick(Near, Direction.map((C) => C / Length), { ...this.Settings, ForceFreshSelection: this.Backend === "WebGPU" }, this.LastCullView);
        this.Picked = Hit;
        this.Selected = Hit ? { Category: "Cluster" } : { Category: "Scene" };
        this.RefreshInspectorSelection();
        this.RefreshOutlinerSelection();
    }

    // ---------------------------------------------------------------- input
    ConstructInput() {
        const Canvases = [this.GlCanvas, this.GpuCanvas];
        let Drag = null;
        for (const Canvas of Canvases) {
            Canvas.addEventListener("contextmenu", (Event) => Event.preventDefault());
            Canvas.addEventListener("pointerdown", (Event) => {
                Canvas.setPointerCapture(Event.pointerId);
                Canvas.focus({ preventScroll: true });
                Drag = { X: Event.clientX, Y: Event.clientY, StartX: Event.clientX, StartY: Event.clientY, Button: Event.button, Shift: Event.shiftKey };
                this.Camera.PathPlaying = false;
            });
            Canvas.addEventListener("pointermove", (Event) => {
                if (!Drag) return;
                const Dx = Event.clientX - Drag.X, Dy = Event.clientY - Drag.Y;
                Drag.X = Event.clientX; Drag.Y = Event.clientY;
                if (Drag.Button === 2 || Drag.Button === 1 || Drag.Shift) this.Camera.Pan(Dx, Dy, this.CssHeight);
                else this.Camera.Rotate(Dx, Dy);
            });
            Canvas.addEventListener("pointerup", (Event) => {
                if (Drag && Drag.Button === 0 && Math.hypot(Event.clientX - Drag.StartX, Event.clientY - Drag.StartY) < 4) this.PickAt(Event.clientX, Event.clientY);
                Drag = null;
            });
            Canvas.addEventListener("wheel", (Event) => {
                Event.preventDefault();
                this.Camera.PathPlaying = false;
                this.Camera.Dolly(Event.deltaY * (Event.deltaMode === 1 ? 16 : 1) * 0.6);
            }, { passive: false });
            Canvas.addEventListener("dblclick", () => this.FramePicked());
        }
        window.addEventListener("keydown", (Event) => {
            if (Event.target.matches("input, select, textarea")) return;
            const Key = Event.key.toLowerCase();
            this.Keys.add(Key);
            if (Event.shiftKey) this.Keys.add("shift");
            if (this.Camera.Mode === "Fly" && "wasdqe".includes(Key)) return;
            if (Key === "f") this.ToggleSetting("FreezeCut");
            else if (Key === "x") this.ToggleSetting("Wireframe");
            else if (Key === "v") this.CycleDebugView(Event.shiftKey ? -1 : 1);
            else if (Key === "c") this.ToggleSetting("EnableOcclusion");
            else if (Key === "b") this.ToggleSetting("ShowBounds");
            else if (Key === "1") this.SetMode("Cluster");
            else if (Key === "2") this.SetMode("Discrete");
            else if (Key === "3") this.SetMode("Compare");
            else if (Key === "home" || Key === "h") this.FrameScene();
            else if (Key === ".") this.FramePicked();
            else if (Key === "p") this.TogglePath();
            else if (Key === "g") this.SetCameraMode(this.Camera.Mode === "Fly" ? "Orbit" : "Fly");
            else if (Key === "escape") { this.Picked = null; this.Selected = { Category: "Scene" }; this.RefreshInspectorSelection(); this.SetNotch(false); }
            else if (Key === "[" || Key === "]") this.SetSetting("Threshold", Clamp(this.Settings.Threshold * (Key === "]" ? 1.25 : 0.8), 0.1, 64));
            else return;
            Event.preventDefault();
        });
        window.addEventListener("keyup", (Event) => { this.Keys.delete(Event.key.toLowerCase()); if (!Event.shiftKey) this.Keys.delete("shift"); });
        window.addEventListener("blur", () => this.Keys.clear());
    }

    ConstructSplit() {
        const Divider = Query("SplitDivider");
        let Dragging = false;
        Divider.addEventListener("pointerdown", (Event) => { Dragging = true; Divider.setPointerCapture(Event.pointerId); });
        Divider.addEventListener("pointermove", (Event) => {
            if (!Dragging) return;
            const Rect = this.Viewport.getBoundingClientRect();
            this.Settings.SplitFraction = Clamp((Event.clientX - Rect.left) / Rect.width, 0.1, 0.9);
            this.PositionSplit();
        });
        Divider.addEventListener("pointerup", () => { Dragging = false; });
        Divider.addEventListener("keydown", (Event) => {
            if (Event.key === "ArrowLeft" || Event.key === "ArrowRight") {
                this.Settings.SplitFraction = Clamp(this.Settings.SplitFraction + (Event.key === "ArrowLeft" ? -0.05 : 0.05), 0.1, 0.9);
                this.PositionSplit();
            }
        });
    }

    PositionSplit() {
        const Compare = this.Settings.Mode === "Compare" && this.Backend === "WebGL2";
        const Divider = Query("SplitDivider");
        Divider.hidden = Query("SplitLabelLeft").hidden = Query("SplitLabelRight").hidden = !Compare;
        if (!Compare) return;
        const X = this.Settings.SplitFraction * (this.CssWidth || 0);
        Divider.style.left = `${X}px`;
        Query("SplitLabelLeft").style.left = `${Math.max(8, X - 110)}px`;
        Query("SplitLabelRight").style.left = `${X + 12}px`;
    }

    // ---------------------------------------------------------------- settings plumbing
    SetSetting(Key, Value) {
        this.Settings[Key] = Value;
        if (Key === "RenderScale") this.ResizeCanvas();
        if (Key === "FreezeCut") Query("FreezeBanner").hidden = !Value;
        if (Key === "EnableOcclusion") { if (this.Gl) this.Gl.DiscardOcclusionQueries(); this.Scene.Instances.forEach((Instance) => (Instance.Occluded = false)); }
        if (Key === "DebugView") this.RefreshLegend();
        for (const Control of document.querySelectorAll(`[data-setting="${Key}"]`)) this.ReflectControl(Control);
    }

    ToggleSetting(Key) {
        this.SetSetting(Key, !this.Settings[Key]);
        const Labels = { FreezeCut: "Freeze cut", Wireframe: "Wireframe", EnableOcclusion: "Occlusion culling", ShowBounds: "Bounds" };
        if (Labels[Key]) this.ShowToast(`${Labels[Key]} ${this.Settings[Key] ? "on" : "off"}`);
    }

    CycleDebugView(Step) {
        this.SetSetting("DebugView", (this.Settings.DebugView + Step + DebugViews.length) % DebugViews.length);
        this.ShowToast(`View: ${DebugViews[this.Settings.DebugView]}`);
    }

    SetMode(Mode) {
        if (this.Backend === "WebGPU" && Mode !== "Cluster") { this.ShowToast("Discrete and Compare modes run on the WebGL2 path"); return; }
        this.Settings.Mode = Mode;
        this.ApplyModeButtons();
        this.PositionSplit();
        this.RefreshInspectorSelection();
    }

    ApplyModeButtons() {
        for (const Button of Query("ModeSegment").querySelectorAll("button")) {
            Button.setAttribute("aria-pressed", String(Button.dataset.mode === this.Settings.Mode));
            Button.disabled = this.Backend === "WebGPU" && Button.dataset.mode !== "Cluster";
        }
    }

    SetCameraMode(Mode) {
        this.Camera.PathPlaying = false;
        this.Camera.SetMode(Mode);
        this.ShowToast(Mode === "Fly" ? "Fly camera: WASD + Q/E, Shift to boost, drag to look" : "Orbit camera");
        this.RefreshNotch();
    }

    TogglePath() {
        this.Camera.PathPlaying = !this.Camera.PathPlaying;
        if (this.Camera.PathPlaying) { this.Camera.PathSphere = this.Scene.SceneSphere(); this.Camera.PathTime = 0; }
        else this.Camera.SetMode("Orbit");
        this.RefreshNotch();
    }

    // Generic controls --------------------------------------------------------
    // Slider + split scalar field: { Setting, Label, Min, Max, Step, Unit, Hint, Logarithmic, Decimals, Target }
    ConstructSlider(Spec) {
        const Target = Spec.Target || this.Settings;
        const Wrapper = document.createElement("div");
        Wrapper.className = "Field";
        const Id = `Control${Spec.Setting}${Math.random().toString(36).slice(2, 7)}`;
        Wrapper.innerHTML = `<label class="FieldLabel" for="${Id}"><span>${Spec.Label}</span>${Spec.Hint ? `<em>${Spec.Hint}</em>` : ""}</label>
            <div class="SliderRow"><input type="range" id="${Id}" min="0" max="1000" step="1" aria-label="${Spec.Label}">
            <span class="SplitScalar"><input type="number" aria-label="${Spec.Label} value" step="${Spec.Step}"><span>${Spec.Unit || ""}</span></span></div>`;
        const Range = Wrapper.querySelector("input[type=range]"), Number_ = Wrapper.querySelector("input[type=number]");
        const ToSlider = (V) => Spec.Logarithmic ? (Math.log(V / Spec.Min) / Math.log(Spec.Max / Spec.Min)) * 1000 : ((V - Spec.Min) / (Spec.Max - Spec.Min)) * 1000;
        const FromSlider = (S) => {
            let V = Spec.Logarithmic ? Spec.Min * Math.pow(Spec.Max / Spec.Min, S / 1000) : Spec.Min + (S / 1000) * (Spec.Max - Spec.Min);
            if (Spec.Step >= 1) V = Math.round(V / Spec.Step) * Spec.Step;
            return V;
        };
        const Reflect = () => {
            const V = Target[Spec.Setting];
            Range.value = ToSlider(V);
            Range.style.setProperty("--fill", `${Range.value / 10}%`);
            if (document.activeElement !== Number_) Number_.value = Number(V).toFixed(Spec.Decimals ?? (Spec.Step >= 1 ? 0 : 2));
        };
        const Commit = (V) => {
            V = Clamp(V, Spec.Min, Spec.Max);
            if (Spec.Target) { Target[Spec.Setting] = V; Reflect(); if (Spec.OnCommit) Spec.OnCommit(V); }
            else this.SetSetting(Spec.Setting, V);
        };
        Range.addEventListener("input", () => Commit(FromSlider(Number(Range.value))));
        Number_.addEventListener("change", () => { const V = parseFloat(Number_.value); if (Number.isFinite(V)) Commit(V); else Reflect(); });
        Wrapper.dataset.setting = Spec.Target ? "" : Spec.Setting;
        Wrapper.Reflect = Reflect;
        Reflect();
        return Wrapper;
    }

    // Property toggle tile with ON/OFF badge and a 44×24 switch.
    ConstructToggleTile(Setting, Label, Hint) {
        const Tile = document.createElement("button");
        Tile.className = "ToggleTile";
        Tile.setAttribute("role", "switch");
        Tile.dataset.setting = Setting;
        Tile.innerHTML = `<span class="TileTop"><span class="TileState"></span><span class="Switch" aria-hidden="true"></span></span><span class="TileLabel">${Label}</span><span class="TileHint">${Hint}</span>`;
        Tile.addEventListener("click", () => this.SetSetting(Setting, !this.Settings[Setting]));
        Tile.Reflect = () => {
            Tile.setAttribute("aria-checked", String(!!this.Settings[Setting]));
            Tile.querySelector(".TileState").textContent = this.Settings[Setting] ? "ON" : "OFF";
        };
        Tile.Reflect();
        return Tile;
    }

    ConstructChips(Setting, Options, Label) {
        const Row = document.createElement("div");
        Row.className = "ChipRow";
        Row.setAttribute("role", "group");
        Row.setAttribute("aria-label", Label);
        Row.dataset.setting = Setting;
        for (const [Scalar, Text, Title] of Options) {
            const Chip = document.createElement("button");
            Chip.className = "Chip";
            Chip.textContent = Text;
            if (Title) Chip.title = Title;
            Chip.dataset.scalar = Scalar;
            Chip.addEventListener("click", () => this.SetSetting(Setting, Scalar));
            Row.append(Chip);
        }
        Row.Reflect = () => { for (const Chip of Row.children) Chip.setAttribute("aria-pressed", String(String(this.Settings[Setting]) === Chip.dataset.scalar)); };
        Row.Reflect();
        return Row;
    }

    ReflectControl(Control) { if (Control.Reflect) Control.Reflect(); }

    ConstructSection(Parent, Title, Trailing) {
        const Section = document.createElement("section");
        Section.className = "Section";
        Section.innerHTML = `<div class="SectionHeader"><h4>${Title}</h4>${Trailing || ""}</div>`;
        Parent.append(Section);
        return Section;
    }

    // ---------------------------------------------------------------- Inspector
    ConstructInspector() {
        const Panel = Query("InspectorPanel");
        Panel.innerHTML = `
            <div class="Breadcrumb" id="Breadcrumb"></div>
            <div class="Hero" id="Hero"></div>
            <div class="MetricGrid">
                <div class="Metric"><b id="MetricTriangles">0</b><span>Triangles drawn</span></div>
                <div class="Metric"><b id="MetricClusters">0</b><span id="MetricClustersLabel">Clusters drawn</span></div>
                <div class="Metric"><b id="MetricReduction">0</b><span>vs. full detail</span></div>
                <div class="Metric"><b id="MetricMilliseconds">0</b><span id="MetricMillisecondsLabel">Frame · CPU select</span></div>
            </div>
            <div id="SelectionReadout"></div>`;

        const Lod = this.ConstructSection(Panel, "Level of detail");
        Lod.append(this.ConstructSlider({ Setting: "Threshold", Label: "Screen-space error threshold", Min: 0.1, Max: 64, Step: 0.01, Unit: "px", Logarithmic: true, Hint: "[ / ]" }));
        const ForcedField = document.createElement("div");
        ForcedField.className = "Field";
        ForcedField.innerHTML = `<label class="FieldLabel" for="ForcedLevelSelect"><span>Isolate DAG level</span><em>debug</em></label><select id="ForcedLevelSelect" data-setting="ForcedLevel"></select>`;
        Lod.append(ForcedField);
        const ForcedSelect = ForcedField.querySelector("select");
        ForcedSelect.addEventListener("change", () => this.SetSetting("ForcedLevel", Number(ForcedSelect.value)));
        ForcedSelect.Reflect = () => {
            const Levels = Math.max(1, ...[...this.Scene.Assets.values()].map((Asset) => Asset.LevelSummary.length));
            if (ForcedSelect.options.length !== Levels + 1) ForcedSelect.innerHTML = `<option value="-1">Automatic cut (Self ≤ τ < Parent)</option>` + Array.from({ length: Levels }, (_, L) => `<option value="${L}">Level ${L} only</option>`).join("");
            ForcedSelect.value = String(this.Settings.ForcedLevel);
        };
        this.ForcedSelect = ForcedSelect;

        const ViewSection = this.ConstructSection(Panel, "Debug view", `<span class="Hint"><kbd>V</kbd> cycles</span>`);
        ViewSection.append(this.ConstructChips("DebugView", DebugViews.map((Name, Index) => [Index, Name, DebugViewHints[Name]]), "Debug view"));
        const ViewHint = document.createElement("p");
        ViewHint.className = "Hint";
        ViewHint.dataset.setting = "DebugView";
        ViewHint.Reflect = () => { ViewHint.textContent = DebugViewHints[DebugViews[this.Settings.DebugView]]; };
        ViewHint.Reflect();
        ViewSection.append(ViewHint);

        const Culling = this.ConstructSection(Panel, "Properties · culling");
        const Grid = document.createElement("div");
        Grid.className = "ToggleGrid";
        Grid.append(
            this.ConstructToggleTile("EnableFrustum", "View volume", "Instances, BVH nodes and clusters outside the frustum."),
            this.ConstructToggleTile("EnableOcclusion", "Occlusion", "Last frame's depth tests each instance's bounds (C)."),
            this.ConstructToggleTile("EnableCone", "Backface cones", "Clusters whose normals all face away."),
            this.ConstructToggleTile("EnableBoundingTree", "Cluster BVH", "Prune whole subtrees by error bounds."),
            this.ConstructToggleTile("FreezeCut", "Freeze cut", "Lock culling + LOD to this view (F)."),
            this.ConstructToggleTile("Wireframe", "Wireframe", "Triangle edges over any view (X)."),
            this.ConstructToggleTile("ShowBounds", "Bounds", "Instance spheres; red = occluded (B)."),
            this.ConstructToggleTile("GroundGrid", "Ground grid", "Infinite reference grid."),
        );
        Culling.append(Grid);

        const Discrete = this.ConstructSection(Panel, "Discrete LOD chain");
        Discrete.append(
            this.ConstructSlider({ Setting: "Hysteresis", Label: "Hysteresis band", Min: 0, Max: 0.6, Step: 0.01, Unit: "×", Hint: "anti-popping" }),
            this.ConstructSlider({ Setting: "Bias", Label: "Level bias", Min: -3, Max: 3, Step: 1, Unit: "lvl" }),
            this.ConstructSlider({ Setting: "FadeMilliseconds", Label: "Cross-fade", Min: 0, Max: 1500, Step: 10, Unit: "ms", Hint: "dithered" }),
            this.ConstructSlider({ Setting: "ForcedDiscreteLevel", Label: "Force discrete level", Min: -1, Max: 12, Step: 1, Unit: "lvl", Hint: "−1 = auto" }),
        );

        const Environment = this.ConstructSection(Panel, "Environment");
        Environment.append(
            this.ConstructSlider({ Setting: "SunElevation", Label: "Sun elevation", Min: 0.05, Max: 1.5, Step: 0.01, Unit: "rad" }),
            this.ConstructSlider({ Setting: "SunAzimuth", Label: "Sun azimuth", Min: -3.14, Max: 3.14, Step: 0.01, Unit: "rad" }),
            this.ConstructSlider({ Setting: "FogDensity", Label: "Fog density", Min: 0, Max: 0.01, Step: 0.0001, Unit: "", Decimals: 4 }),
            this.ConstructSlider({ Setting: "RenderScale", Label: "Render scale", Min: 0.25, Max: 1, Step: 0.05, Unit: "×", Hint: "changes τ in pixels" }),
        );

        const Help = this.ConstructSection(Panel, "Controls");
        Help.insertAdjacentHTML("beforeend", `<p class="Hint">Drag orbit · right/shift-drag pan · wheel zoom · click picks a cluster · double-click frames it · <kbd>G</kbd> fly (WASD/QE) · <kbd>P</kbd> fly-through · <kbd>H</kbd> frame scene · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> modes · <kbd>Esc</kbd> clear.</p>`);
        this.RefreshInspectorSelection();
        this.ConstructStatisticsPanel();
        this.ConstructBuildPanel();
    }

    RefreshInspectorSelection() {
        const Hero = Query("Hero"), Crumb = Query("Breadcrumb"), Readout = Query("SelectionReadout");
        if (this.ForcedSelect) this.ForcedSelect.Reflect();
        const D = this.Picked && this.LastCullView ? this.Scene.DescribeCluster(this.Picked, this.LastCullView, this.Settings) : null;
        if (!D && this.Picked) this.Picked = null;
        if (D) {
            Crumb.innerHTML = `Scene › ${D.Asset.Definition.Label} › Instance ${this.Picked.Instance} › <b>Cluster ${this.Picked.Cluster}</b>`;
            Hero.innerHTML = `<h2>Cluster ${this.Picked.Cluster}</h2><span>${D.Asset.Definition.Label} · level ${D.Level} · ${D.Triangles} triangles · ${D.Group === null ? "root (no parent group)" : `group ${D.Group}`}</span>`;
            Hero.style.background = `linear-gradient(135deg, ${LevelSwatch(D.Level)}55, #15151a 65%)`;
            const Selected = D.SelfProjected <= D.Threshold && D.Threshold < D.ParentProjected;
            const Reason = Selected
                ? `Selected: its own error projects to ${D.SelfProjected.toFixed(2)} px (≤ τ = ${D.Threshold.toFixed(2)} px) while its parent group's error projects to ${Number.isFinite(D.ParentProjected) ? D.ParentProjected.toFixed(2) + " px" : "∞ (root)"} (> τ). Exactly one of the cluster and its parents passes, so the cut is watertight.`
                : D.SelfProjected > D.Threshold
                    ? `This cluster would be too coarse now (${D.SelfProjected.toFixed(2)} px > τ); its finer children would replace it.`
                    : `Its parent is already fine enough (${D.ParentProjected.toFixed(2)} px ≤ τ), so the parent group replaces it.`;
            Readout.innerHTML = `<dl class="ReadoutList">
                <dt>Self error (world)</dt><dd>${D.SelfError.toExponential(2)}</dd>
                <dt>Parent error (world)</dt><dd>${Number.isFinite(D.ParentError) ? D.ParentError.toExponential(2) : "∞ root"}</dd>
                <dt>Self projected</dt><dd>${D.SelfProjected.toFixed(3)} px</dd>
                <dt>Parent projected</dt><dd>${Number.isFinite(D.ParentProjected) ? D.ParentProjected.toFixed(3) + " px" : "∞"}</dd>
                <dt>Bounding radius</dt><dd>${D.Radius.toFixed(3)} m</dd>
                <dt>Distance</dt><dd>${D.Distance.toFixed(2)} m</dd>
                <dt>Normal cone</dt><dd>${D.ConeCutoff >= 1 ? "off (too curved)" : `cos ${D.ConeCutoff.toFixed(2)}`}</dd>
            </dl><p class="Verdict ${Selected ? "" : "Warn"}">${Reason}</p>`;
        } else {
            const Layout = this.Scene.Layout;
            Crumb.innerHTML = `Scene › <b>${Layout.Label}</b>`;
            Hero.style.background = "";
            Hero.innerHTML = `<h2>${Layout.Label}</h2><span>${this.Scene.Instances.length.toLocaleString()} instances · ${this.Scene.Assets.size} cluster DAG assets · ${this.Settings.Mode === "Cluster" ? "Nanite-style cluster cut" : this.Settings.Mode === "Discrete" ? "discrete LOD chain" : "side-by-side comparison"}</span>`;
            Readout.innerHTML = `<p class="Hint">Click any surface to inspect the cluster the cut selected there and why.</p>`;
        }
    }

    ConstructStatisticsPanel() {
        const Panel = Query("StatisticsPanel");
        Panel.innerHTML = `
            <div class="Section"><div class="SectionHeader"><h4>Triangles per frame</h4><span class="Hint" id="SparkTriangles"></span></div><canvas class="Sparkline" id="SparkCanvas" width="560" height="88" aria-label="Triangle history"></canvas></div>
            <div class="Section"><div class="SectionHeader"><h4>Selection funnel</h4></div><dl class="ReadoutList" id="Funnel"></dl></div>
            <div class="Section"><div class="SectionHeader"><h4>Instances</h4></div><dl class="ReadoutList" id="InstanceFunnel"></dl></div>
            <div class="Section"><div class="SectionHeader"><h4>Drawn clusters by level</h4></div><div class="LevelBars" id="LevelBars"></div></div>
            <div class="Section"><div class="SectionHeader"><h4>Renderer</h4></div><dl class="ReadoutList" id="RendererReadout"></dl></div>`;
    }

    ConstructBuildPanel() {
        const Panel = Query("BuildPanel");
        Panel.innerHTML = "";
        const Backend = this.ConstructSection(Panel, "Rasterization backend");
        const Chips = document.createElement("div");
        Chips.className = "ChipRow";
        Chips.id = "BackendChips";
        Backend.append(Chips);
        Backend.insertAdjacentHTML("beforeend", `<p class="Hint">WebGL2 selects the cut on the CPU (bounding tree + per-cluster test) and draws contiguous vertex ranges with multi-draw. WebGPU runs the same test per (instance, cluster) in a compute shader with GPU occlusion results, then a single indirect draw renders the whole cut with vertex pulling.</p>`);
        this.RefreshBackendChips();

        const Builder = this.ConstructSection(Panel, "Cluster DAG builder");
        Builder.append(
            this.ConstructSlider({ Setting: "ClusterSize", Target: this.BuildOptions, Label: "Triangles per cluster", Min: 32, Max: 256, Step: 32, Unit: "tri" }),
            this.ConstructSlider({ Setting: "GroupSize", Target: this.BuildOptions, Label: "Clusters per group", Min: 2, Max: 16, Step: 1, Unit: "cl" }),
        );
        const Rebuild = document.createElement("button");
        Rebuild.className = "Primary";
        Rebuild.textContent = "Rebuild all assets";
        Rebuild.addEventListener("click", () => this.RebuildAll());
        Builder.append(Rebuild);
        Builder.insertAdjacentHTML("beforeend", `<p class="Hint">Pipeline per level: partition triangles into clusters → group adjacent clusters → merge each group, lock its border, simplify to half with quadric edge collapse → split into new clusters. Errors and bounding spheres are forced monotonic so every cluster's choice is independent and crack-free.</p>`);

        const Layout = this.ConstructSection(Panel, "Instance layout");
        Layout.append(
            this.ConstructSlider({ Setting: "Rows", Target: this.Scene.Layout, Label: "Rows", Min: 1, Max: 64, Step: 1, Unit: "", OnCommit: () => this.ScheduleLayout() }),
            this.ConstructSlider({ Setting: "Spacing", Target: this.Scene.Layout, Label: "Spacing", Min: 2, Max: 40, Step: 0.5, Unit: "m", OnCommit: () => this.ScheduleLayout() }),
        );
        this.LayoutSliders = [...Layout.querySelectorAll(".Field")];
        const AssetsSection = this.ConstructSection(Panel, "Built assets");
        AssetsSection.insertAdjacentHTML("beforeend", `<div id="AssetReports"></div>`);
        this.RefreshBuildPanel();
    }

    ScheduleLayout() {
        clearTimeout(this.LayoutTimer);
        this.LayoutTimer = setTimeout(() => { this.Scene.RebuildInstances(); this.InstancesChanged(); this.RefreshInspectorSelection(); }, 120);
    }

    RefreshBackendChips() {
        const Chips = Query("BackendChips");
        if (!Chips) return;
        Chips.innerHTML = "";
        for (const [Backend, Label, Available] of [["WebGL2", "WebGL2 · CPU cut", true], ["WebGPU", "WebGPU · compute cull", this.GpuAvailable]]) {
            const Chip = document.createElement("button");
            Chip.className = "Chip";
            Chip.textContent = Available ? Label : `${Label} (unavailable)`;
            Chip.disabled = !Available;
            Chip.setAttribute("aria-pressed", String(this.Backend === Backend));
            Chip.addEventListener("click", () => this.SelectBackend(Backend));
            Chips.append(Chip);
        }
    }

    RefreshBuildPanel() {
        const Reports = Query("AssetReports");
        if (!Reports) return;
        for (const Slider of this.LayoutSliders || []) Slider.Reflect();
        Reports.innerHTML = [...this.Scene.Assets.values()].map((Asset) => {
            const Timings = Object.entries(Asset.Timings || {}).map(([Phase, Ms]) => `${Phase} ${Math.round(Ms)}ms`).join(" · ");
            return `<div class="Metric" style="display:flex;flex-direction:column;gap:6px">
                <h3>${Asset.Definition.Label}</h3>
                <dl class="ReadoutList">
                    <dt>Source triangles</dt><dd>${Asset.SourceTriangleCount.toLocaleString()}</dd>
                    <dt>Clusters / groups</dt><dd>${Asset.ClusterCount.toLocaleString()} / ${Asset.GroupCount.toLocaleString()}</dd>
                    <dt>DAG levels</dt><dd>${Asset.LevelSummary.length}</dd>
                    <dt>Root clusters</dt><dd>${Asset.LevelSummary[Asset.LevelSummary.length - 1].ClusterCount}</dd>
                    <dt>Discrete levels</dt><dd>${Asset.DiscreteTable.length}</dd>
                    <dt>Unsimplifiable groups</dt><dd>${Asset.FailedGroups || 0}</dd>
                    <dt>Build time</dt><dd>${Math.round(Asset.BuildMilliseconds || 0)} ms</dd>
                </dl>
                <span class="Hint">${Timings}</span>
            </div>`;
        }).join("") || `<p class="Empty">No assets built yet.</p>`;
    }

    RefreshLevelsPanel() {
        const Assets = [...this.Scene.Assets.values()];
        Query("LevelSummary").innerHTML = Assets.map((Asset) => `<h3 style="margin:6px 0 4px">${Asset.Definition.Label}</h3><div class="LevelBars">${Asset.LevelSummary.map((Level) => {
            const Width = Math.max(1, (Level.TriangleCount / Asset.LevelSummary[0].TriangleCount) * 100);
            return `<div class="LevelBar" title="Level ${Level.Level}: ${Level.ClusterCount} clusters, ${Level.TriangleCount} triangles, error ${Level.MinError.toExponential(1)}–${Level.MaxError.toExponential(1)}"><span>L${Level.Level}</span><i style="width:${Width}%;background:${LevelSwatch(Level.Level)}"></i><span>${Format(Level.TriangleCount)}</span></div>`;
        }).join("")}</div>`).join("") || `<p class="Empty">Building…</p>`;
        Query("DiscreteSummary").innerHTML = Assets.map((Asset) => `<p class="Hint"><b style="color:#ccc;font-weight:400">${Asset.Definition.Label}</b>: ${Asset.DiscreteTable.map((Entry) => Format(Entry.TriangleCount)).join(" → ")}</p>`).join("");
        const Bytes = (this.Backend === "WebGPU" && this.Gpu ? this.Gpu.GpuBytes : this.Gl?.GpuBytes) || 0;
        Query("FooterAssets").textContent = Assets.length;
        Query("FooterClusters").textContent = Format(Assets.reduce((Sum, Asset) => Sum + Asset.ClusterCount, 0));
        Query("FooterBytes").textContent = FormatBytes(Bytes);
    }

    // ---------------------------------------------------------------- Outliner
    RefreshOutliner() {
        const Container = Query("OutlinerCollections");
        const Filter = (Query("OutlinerSearch").value || "").toLowerCase();
        const Groups = new Map();
        this.Scene.Instances.forEach((Instance, Index) => {
            const Key = Instance.Group || Instance.AssetKey;
            if (!Groups.has(Key)) Groups.set(Key, []);
            Groups.get(Key).push(Index);
        });
        const AssetRows = [...this.Scene.Assets.values()].map((Asset) => {
            const Hidden = this.Scene.Hidden.has(Asset.Key);
            const Count = this.Scene.Instances.filter((Instance) => Instance.AssetKey === Asset.Key).length;
            return `<div class="Row ${Hidden ? "Muted" : ""}" data-asset="${Asset.Key}" role="option" aria-selected="false">
                <span class="Swatch" style="background:rgb(${Asset.Definition.Albedo.map((C) => Math.round(Math.sqrt(C) * 255)).join(",")})"></span>
                <span>${Asset.Definition.Label}</span><span class="Trailing">${Count}×</span>
                <button class="Visibility" data-toggle-asset="${Asset.Key}" aria-label="${Hidden ? "Show" : "Hide"} ${Asset.Definition.Label}" title="${Hidden ? "Show" : "Hide"}">${Hidden ? "◌" : "●"}</button></div>`;
        }).join("");
        let Html = `<div class="Collection ${this.ExpandedCollections.has("Assets") ? "" : "Collapsed"}" data-collection="Assets">
            <div class="CollectionHeader" role="button" tabindex="0"><span class="Chevron">▾</span>Cluster DAG assets<span class="Count">${this.Scene.Assets.size}</span></div>
            <div class="Rows" role="listbox" aria-label="Assets">${AssetRows}</div></div>`;
        for (const [Name, Indices] of Groups) {
            const Visible = Indices.filter((Index) => !Filter || `${Name} ${Index}`.toLowerCase().includes(Filter));
            if (!Visible.length) continue;
            const Rows = Visible.slice(0, 400).map((Index) => {
                const Instance = this.Scene.Instances[Index];
                return `<div class="Row" data-instance="${Index}" role="option" aria-selected="false"><span class="Swatch" style="background:#444"></span><span>${Instance.AssetKey} ${String(Index).padStart(3, "0")}</span><span class="Trailing" data-instance-tris="${Index}"></span></div>`;
            }).join("") + (Visible.length > 400 ? `<p class="Empty">…and ${Visible.length - 400} more</p>` : "");
            Html += `<div class="Collection ${this.ExpandedCollections.has(Name) || Filter ? "" : "Collapsed"}" data-collection="${Name}">
                <div class="CollectionHeader" role="button" tabindex="0"><span class="Chevron">▾</span>${Name}<span class="Count">${Indices.length}</span></div>
                <div class="Rows" role="listbox" aria-label="${Name}">${Rows}</div></div>`;
        }
        Container.innerHTML = Html;
        this.RefreshOutlinerSelection();
    }

    RefreshOutlinerSelection() {
        for (const Row of document.querySelectorAll("#OutlinerCollections .Row[data-instance]")) {
            Row.setAttribute("aria-selected", String(!!this.Picked && Number(Row.dataset.instance) === this.Picked.Instance));
        }
    }

    ConstructTabs() {
        for (const Strip of document.querySelectorAll(".TabStrip")) {
            Strip.addEventListener("click", (Event) => {
                const Tab = Event.target.closest(".Tab");
                if (!Tab) return;
                for (const Other of Strip.querySelectorAll(".Tab")) {
                    const Selected = Other === Tab;
                    Other.setAttribute("aria-selected", String(Selected));
                    Query(Other.getAttribute("aria-controls")).hidden = !Selected;
                }
                if (Tab.id === "LevelsTab") this.RefreshLevelsPanel();
            });
        }
        Query("OutlinerSearch").addEventListener("input", () => this.RefreshOutliner());
        Query("OutlinerCollections").addEventListener("click", (Event) => {
            const Toggle = Event.target.closest("[data-toggle-asset]");
            if (Toggle) {
                const Key = Toggle.dataset.toggleAsset;
                if (this.Scene.Hidden.has(Key)) this.Scene.Hidden.delete(Key); else this.Scene.Hidden.add(Key);
                this.InstancesChanged();
                return;
            }
            const Header = Event.target.closest(".CollectionHeader");
            if (Header) {
                const Collection = Header.parentElement;
                Collection.classList.toggle("Collapsed");
                const Name = Collection.dataset.collection;
                if (Collection.classList.contains("Collapsed")) this.ExpandedCollections.delete(Name); else this.ExpandedCollections.add(Name);
                return;
            }
            const Row = Event.target.closest(".Row[data-instance]");
            if (Row) {
                const Instance = this.Scene.Instances[Number(Row.dataset.instance)];
                this.Camera.FrameSphere(Instance.WorldSphere.map((C, Index) => (Index === 3 ? C * 1.2 : C)));
                this.Picked = null;
                this.RefreshInspectorSelection();
            }
        });
    }

    // ---------------------------------------------------------------- Notch + drawer
    ConstructNotch() {
        Query("NotchHandle").addEventListener("click", () => this.SetNotch(!Query("Notch").classList.contains("Open")));
        this.RefreshNotch();
    }

    SetNotch(Open) {
        Query("Notch").classList.toggle("Open", Open);
        Query("NotchHandle").setAttribute("aria-expanded", String(Open));
    }

    RefreshNotch() {
        const Dashboard = Query("NotchDashboard");
        const Entries = [
            ["Orbit camera", "H", this.Camera.Mode === "Orbit" && !this.Camera.PathPlaying, () => this.SetCameraMode("Orbit")],
            ["Fly camera", "G", this.Camera.Mode === "Fly" && !this.Camera.PathPlaying, () => this.SetCameraMode("Fly")],
            ["Fly-through path", "P", this.Camera.PathPlaying, () => this.TogglePath()],
            ["Frame scene", "H", false, () => this.FrameScene()],
            ["Freeze cut", "F", this.Settings.FreezeCut, () => this.ToggleSetting("FreezeCut")],
            ["Wireframe", "X", this.Settings.Wireframe, () => this.ToggleSetting("Wireframe")],
            ["Cycle debug view", "V", false, () => this.CycleDebugView(1)],
            ["Bounds", "B", this.Settings.ShowBounds, () => this.ToggleSetting("ShowBounds")],
        ];
        Dashboard.innerHTML = "";
        for (const [Label, Key, Pressed, Run] of Entries) {
            const Button = document.createElement("button");
            Button.className = "QuickButton";
            Button.setAttribute("aria-pressed", String(Pressed));
            Button.innerHTML = `<span>${Label}</span><kbd>${Key}</kbd>`;
            Button.addEventListener("click", () => { Run(); this.RefreshNotch(); });
            Dashboard.append(Button);
        }
        const Threshold = this.ConstructSlider({ Setting: "Threshold", Label: "Error threshold", Min: 0.1, Max: 64, Step: 0.01, Unit: "px", Logarithmic: true });
        Threshold.classList.add("Wide");
        Dashboard.append(Threshold);
        Query("NotchLabel").textContent = this.Camera.PathPlaying ? "Fly-through" : `${this.Camera.Mode} · quick tools`;
    }

    ConstructDrawer() {
        const Drawer = Query("Drawer"), Handle = Query("DrawerHandle");
        const Toggle = (Event) => {
            if (Event.target.closest("select, button, label")) return;
            const Open = !Drawer.classList.contains("Open");
            Drawer.classList.toggle("Open", Open);
            Handle.setAttribute("aria-expanded", String(Open));
        };
        Handle.addEventListener("click", Toggle);
        Handle.addEventListener("keydown", (Event) => { if (Event.key === "Enter" || Event.key === " ") { Event.preventDefault(); Toggle(Event); } });
        const Select = Query("LayoutSelect");
        Select.innerHTML = Object.entries(LayoutPresets).map(([Key, Preset]) => `<option value="${Key}">${Preset.Label}</option>`).join("");
        Select.addEventListener("change", () => this.ApplyLayout(Select.value));
        Query("ImportButton").addEventListener("click", () => Query("ImportInput").click());
        Query("ImportInput").addEventListener("change", (Event) => { const File = Event.target.files[0]; if (File) this.ImportWavefront(File); Event.target.value = ""; });
        this.RefreshDrawer();
    }

    async ApplyLayout(Key) {
        Query("LayoutSelect").value = Key;
        this.Picked = null;
        this.Selected = { Category: "Scene" };
        this.Scene.ApplyLayout(Key);
        await this.BuildMissingAssets();
        this.FrameScene();
        this.ConstructBuildPanel();
        this.RefreshInspectorSelection();
        this.ShowToast(`${LayoutPresets[Key].Label}: ${this.Scene.Instances.length.toLocaleString()} instances`);
    }

    RefreshDrawer() {
        const Body = Query("DrawerBody");
        const Definitions = [...AssetDefinitions, ...(this.ImportedDefinitions || [])];
        Body.innerHTML = Definitions.map((Definition) => {
            const Asset = this.Scene.Assets.get(Definition.Key);
            return `<button class="AssetTile" data-asset-key="${Definition.Key}" aria-pressed="${this.Scene.Layout.Assets.includes(Definition.Key)}" title="${Asset ? "Show this asset as a grid" : "Build this asset"}">
                <span class="AssetThumb">${SvgIcon(Icons[Definition.Icon] || Icons.import, 34)}</span>
                <b>${Definition.Label}</b>
                <span>${Asset ? `${Format(Asset.SourceTriangleCount)} tris · ${Asset.ClusterCount} clusters · ${Asset.LevelSummary.length} levels` : "not built"}</span>
                <span class="Badge ${Asset ? "" : "Pending"}">${Asset ? "DAG ready" : "build on demand"}</span></button>`;
        }).join("");
        for (const Tile of Body.querySelectorAll(".AssetTile")) {
            Tile.addEventListener("click", async () => {
                const Key = Tile.dataset.assetKey;
                const Definition = this.ResolveDefinition(Key);
                if (!this.Scene.Assets.has(Key)) await this.BuildAssets([Definition]);
                if (!this.Scene.Assets.has(Key)) return;
                const Radius = this.Scene.Assets.get(Key).AssetSphere[3];
                this.Scene.Layout = { Key: "Single", Label: `${Definition.Label} grid`, Assets: [Key], Rows: 8, Spacing: Math.max(3, Radius * 2.4), ScaleMin: 1, ScaleMax: 1, Seed: 1, Ground: true };
                this.Scene.RebuildInstances();
                this.InstancesChanged();
                this.FrameScene();
                this.ConstructBuildPanel();
                this.RefreshDrawer();
                this.RefreshInspectorSelection();
            });
        }
        const Built = [...this.Scene.Assets.values()];
        Query("DrawerSummary").textContent = `${Built.length} built · ${Format(Built.reduce((Sum, Asset) => Sum + Asset.SourceTriangleCount, 0))} source triangles`;
    }

    // ---------------------------------------------------------------- live readouts
    RefreshLiveReadouts() {
        const L = this.Live;
        if (!L) return;
        Query("MetricTriangles").innerHTML = Format(L.Triangles);
        Query("MetricClusters").innerHTML = this.Settings.Mode === "Discrete" ? `${L.InstancesDrawn}` : Format(L.Clusters);
        Query("MetricClustersLabel").textContent = this.Settings.Mode === "Discrete" ? "Instances drawn" : "Clusters drawn";
        const Reduction = L.SourceTriangles ? L.SourceTriangles / Math.max(1, L.Triangles) : 0;
        Query("MetricReduction").innerHTML = !L.Triangles ? "—" : `${Reduction >= 100 ? Math.round(Reduction) : Reduction.toFixed(1)}<small>× fewer</small>`;
        Query("MetricMilliseconds").innerHTML = `${this.FrameMilliseconds.toFixed(1)}<small>/ ${L.CpuMilliseconds.toFixed(1)} ms</small>`;
        Query("MetricMillisecondsLabel").textContent = this.Backend === "WebGPU" ? "Frame · CPU submit" : "Frame · CPU select";
        Query("OutlinerVisible").textContent = L.InstancesDrawn.toLocaleString();
        Query("OutlinerHidden").textContent = (L.InstancesCulledFrustum + L.InstancesOccluded).toLocaleString();

        const Gpu = L.GpuMilliseconds;
        Query("Hud").innerHTML = `<b>${Format(L.Triangles)}</b> tris · <b>${Format(L.Clusters)}</b> clusters · <b>${L.InstancesDrawn}</b>/${L.InstancesTotal} instances<br>
            τ ${this.Settings.Threshold.toFixed(2)} px · ${DebugViews[this.Settings.DebugView]}${this.Settings.FreezeCut ? " · <b style='color:#ffcf8a'>frozen</b>" : ""} · ${(1000 / this.FrameMilliseconds).toFixed(0)} fps${Gpu != null && Gpu > 0 ? ` · GPU ${Gpu.toFixed(2)} ms` : ""}`;

        const T = L.Tally;
        Query("Funnel").innerHTML = this.Backend === "WebGPU"
            ? `<dt>Threads (instance × cluster)</dt><dd>${Format(T.ClustersTested)}</dd><dt>Rejected by LOD cut</dt><dd>${Format(T.ClustersRejectedLevel)}</dd><dt>Cluster frustum culled</dt><dd>${Format(T.ClustersCulledFrustum)}</dd><dt>Backface cone culled</dt><dd>${Format(T.ClustersCulledCone)}</dd><dt>Drawn</dt><dd>${Format(T.ClustersDrawn)}${L.Overflow ? " (overflow!)" : ""}</dd>`
            : `<dt>BVH nodes visited</dt><dd>${Format(T.NodesVisited)}</dd><dt>Nodes frustum culled</dt><dd>${Format(T.NodesCulledFrustum)}</dd><dt>Nodes pruned by error</dt><dd>${Format(T.NodesPrunedError)}</dd><dt>Clusters tested</dt><dd>${Format(T.ClustersTested)}</dd><dt>Rejected by LOD cut</dt><dd>${Format(T.ClustersRejectedLevel)}</dd><dt>Cluster frustum culled</dt><dd>${Format(T.ClustersCulledFrustum)}</dd><dt>Backface cone culled</dt><dd>${Format(T.ClustersCulledCone)}</dd><dt>Drawn</dt><dd>${Format(T.ClustersDrawn)}</dd><dt>Merged draw ranges</dt><dd>${Format(L.Ranges)}</dd>`;
        Query("InstanceFunnel").innerHTML = `<dt>Total</dt><dd>${L.InstancesTotal}</dd><dt>View-volume culled</dt><dd>${L.InstancesCulledFrustum}</dd><dt>Occluded</dt><dd>${L.InstancesOccluded}</dd><dt>Drawn</dt><dd>${L.InstancesDrawn}</dd><dt>Full-detail triangles</dt><dd>${Format(L.SourceTriangles)}</dd>${this.Settings.Mode !== "Cluster" ? `<dt>Discrete triangles</dt><dd>${Format(L.DiscreteTriangles)}</dd><dt>Discrete switches / tick</dt><dd>${L.DiscreteSwitches || 0}</dd>` : ""}`;
        const Levels = L.LevelClusters || [];
        const Max = Math.max(1, ...Levels);
        let Bars = "";
        for (let Level = 0; Level < 32; Level++) if (Levels[Level]) Bars += `<div class="LevelBar"><span>L${Level}</span><i style="width:${(Levels[Level] / Max) * 100}%;background:${LevelSwatch(Level)}"></i><span>${Format(Levels[Level])}</span></div>`;
        Query("LevelBars").innerHTML = Bars || `<p class="Empty">Nothing drawn.</p>`;
        if (!Query("LevelsPanel").hidden) Query("CutComposition").innerHTML = Bars;
        Query("RendererReadout").innerHTML = `<dt>Backend</dt><dd>${L.Backend}</dd><dt>Adapter</dt><dd title="${(this.Backend === "WebGPU" && this.Gpu ? this.Gpu.Adapter : this.Gl?.Adapter) || ""}">${(this.Backend === "WebGPU" && this.Gpu ? this.Gpu.Adapter : this.Gl?.Adapter) || "—"}</dd><dt>Resolution</dt><dd>${this.Width}×${this.Height}</dd><dt>GPU time</dt><dd>${Gpu != null && Gpu > 0 ? Gpu.toFixed(2) + " ms" : "n/a (timer query unavailable)"}</dd><dt>Geometry memory</dt><dd>${FormatBytes((this.Backend === "WebGPU" && this.Gpu ? this.Gpu.GpuBytes : this.Gl?.GpuBytes) || 0)}</dd>`;
        this.DrawSparkline();

        const Eye = this.Camera.Eye();
        Query("StatusBackend").innerHTML = `<b>${L.Backend}</b>`;
        Query("StatusTriangles").innerHTML = `Drawn <b>${Format(L.Triangles)}</b> of <b>${Format(L.SourceTriangles)}</b> source triangles`;
        Query("StatusTimings").innerHTML = `Frame <b>${this.FrameMilliseconds.toFixed(1)} ms</b>`;
        Query("StatusCamera").textContent = `${this.Camera.PathPlaying ? "Path" : this.Camera.Mode} · ${Eye.map((C) => C.toFixed(1)).join(", ")}`;
        if (this.Picked) this.RefreshInspectorSelection();
    }

    DrawSparkline() {
        const Canvas = Query("SparkCanvas");
        if (!Canvas || Query("StatisticsPanel").hidden) return;
        const C = Canvas.getContext("2d");
        C.clearRect(0, 0, Canvas.width, Canvas.height);
        const Max = Math.max(1, ...this.History.map((Entry) => Entry.Triangles));
        C.strokeStyle = "#e0e0e0"; C.lineWidth = 2; C.beginPath();
        this.History.forEach((Entry, Index) => {
            const X = (Index / 179) * Canvas.width, Y = Canvas.height - 6 - (Entry.Triangles / Max) * (Canvas.height - 12);
            if (Index) C.lineTo(X, Y); else C.moveTo(X, Y);
        });
        C.stroke();
        C.strokeStyle = "#ff9f2e88"; C.lineWidth = 1.5; C.beginPath();
        this.History.forEach((Entry, Index) => {
            const X = (Index / 179) * Canvas.width, Y = Canvas.height - 6 - Math.min(1, Entry.Milliseconds / 50) * (Canvas.height - 12);
            if (Index) C.lineTo(X, Y); else C.moveTo(X, Y);
        });
        C.stroke();
        Query("SparkTriangles").innerHTML = `peak ${Format(Max)} · <span style="color:#ff9f2e">frame ms</span>`;
    }

    RefreshLegend() {
        const Legend = Query("Legend");
        const View = DebugViews[this.Settings.DebugView];
        if (View === "Error") {
            Legend.hidden = false;
            Legend.innerHTML = `<span>Projected error ÷ τ</span><div class="LegendBar" style="background:linear-gradient(90deg,#1a3399 0%,#26bf8c 33%,#ffd140 66%,#ff3326 100%)"></div><div class="LegendScale"><span>0</span><span>0.5</span><span>1.0</span><span>1.5</span></div>`;
        } else if (View === "Level") {
            Legend.hidden = false;
            Legend.innerHTML = `<span>DAG level</span><div class="LegendChips">${LevelPalette.map((Colour, Index) => `<span><i style="background:${Colour}"></i>L${Index}${Index === LevelPalette.length - 1 ? "+" : ""}</span>`).join("")}</div>`;
        } else Legend.hidden = true;
    }

    // ---------------------------------------------------------------- feedback
    SetStatus(Text, Busy) {
        Query("StatusText").textContent = Text;
        Query("StatusDot").classList.toggle("Busy", !!Busy);
    }

    ShowToast(Text) {
        const Toast = Query("Toast");
        Toast.textContent = Text;
        Toast.style.opacity = "1";
        clearTimeout(this.ToastTimer);
        this.ToastTimer = setTimeout(() => (Toast.style.opacity = "0"), 2400);
    }

    ReportFatal(Text) {
        console.error(Text);
        const Veil = Query("ProgressVeil");
        Veil.hidden = false;
        Query("ProgressTitle").textContent = "Something went wrong";
        Query("ProgressLog").textContent = Text;
        this.SetStatus(Text, true);
    }
}

const Editor = new VirtualGeometryEditor();
Editor.Start().catch((Failure) => Editor.ReportFatal(Failure.stack || String(Failure)));
