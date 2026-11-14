// Scene description (asset definitions, instance layouts) and per-frame CPU work shared by
// both rasterization paths: instance culling, occlusion bookkeeping, cluster-cut / discrete
// selection, draw-range construction, statistics, debug lines, and CPU ray picking.

import {
    InvertTransform, PlacementTransform, ExtractViewVolumePlanes, TransformPlanesToLocal,
    SphereInsideViewVolume, TransformPoint, MultiplyTransforms,
} from "./LinearAlgebra.js";
import {
    ClusterCutSelector, DiscreteLevelSelector, ConstructSelectionTally, ResetSelectionTally,
    ConstructDiscreteTrack, ProjectionScale,
} from "./ClusterCutSelector.js";
import { ClusterFloatStride, ClusterIntegerStride, VertexWordStride } from "./ClusterHierarchyBuilder.js";

export const AssetDefinitions = [
    { Key: "Boulder", Label: "Basalt Boulder", Generator: "Boulder", GeneratorOptions: { Subdivisions: 6, Seed: 7 }, Albedo: [0.20, 0.18, 0.17], Roughness: 0.8, Icon: "boulder" },
    { Key: "Terrain", Label: "Terrain Tile", Generator: "Terrain", GeneratorOptions: { Resolution: 256, Extent: 240, Relief: 26, Seed: 11 }, Albedo: [0.15, 0.16, 0.115], Roughness: 0.9, Icon: "terrain" },
    { Key: "TorusKnot", Label: "Torus Knot", Generator: "TorusKnot", GeneratorOptions: { TubularSegments: 768, RadialSegments: 48 }, Albedo: [0.62, 0.48, 0.30], Roughness: 0.35, Icon: "knot" },
    { Key: "Column", Label: "Fluted Column", Generator: "Column", GeneratorOptions: { HeightSegments: 384, RadialSegments: 160 }, Albedo: [0.68, 0.64, 0.58], Roughness: 0.6, Icon: "column" },
];

export const LayoutPresets = {
    BoulderField: { Label: "Boulder Field", Assets: ["Terrain", "Boulder"], Rows: 12, Spacing: 15, ScaleMin: 1.6, ScaleMax: 4.2, Seed: 3, Ground: false, View: { Target: [0, 4, 6], Distance: 120, Yaw: 0.75, Pitch: 0.3 } },
    Colonnade: { Label: "Colonnade", Assets: ["Column", "Boulder"], Rows: 40, Spacing: 9, ScaleMin: 1.0, ScaleMax: 1.0, Seed: 5, Ground: true, View: { Target: [0, 3, -40], Distance: 62, Yaw: 0.42, Pitch: 0.1 } },
    KnotGallery: { Label: "Knot Gallery", Assets: ["TorusKnot", "Column"], Rows: 6, Spacing: 10, ScaleMin: 1.5, ScaleMax: 2.5, Seed: 9, Ground: true },
    StressField: { Label: "Stress Field", Assets: ["Boulder", "TorusKnot", "Column"], Rows: 32, Spacing: 8, ScaleMin: 1.0, ScaleMax: 2.6, Seed: 17, Ground: true, View: { Target: [0, 0, 20], Distance: 150, Yaw: 0.6, Pitch: 0.22 } },
};

function SeededRandom(Seed) {
    let S = Seed >>> 0 || 1;
    return () => { S = (Math.imul(S, 1664525) + 1013904223) >>> 0; return S / 4294967296; };
}

export function ConstructDefaultSettings() {
    return {
        Mode: "Cluster",
        Threshold: 1.0,
        DebugView: 0,
        Wireframe: false,
        EnableFrustum: true,
        EnableOcclusion: true,
        EnableCone: true,
        EnableBoundingTree: true,
        FreezeCut: false,
        ForcedLevel: -1,
        Hysteresis: 0.15,
        Bias: 0,
        ForcedDiscreteLevel: -1,
        FadeMilliseconds: 300,
        GroundGrid: true,
        FogDensity: 0.0004,
        RenderScale: 1,
        ShowBounds: false,
        SplitFraction: 0.5,
        SunAzimuth: 0.9,
        SunElevation: 0.62,
        SunIntensity: 2.6,
    };
}

export class VirtualGeometryScene {
    constructor() {
        this.Assets = new Map();            // Key → packed asset (+ Selector, Discrete)
        this.UploadedOrder = [];             // assets in GPU upload order
        this.Instances = [];
        this.Layout = { ...LayoutPresets.BoulderField, Key: "BoulderField" };
        this.FrameIndex = 0;
        this.Tally = ConstructSelectionTally();
        this.CompareTally = ConstructSelectionTally();
        this.Statistics = {};
        this.FrozenView = null;
        this.Hidden = new Set();             // asset keys hidden from the outliner
    }

    RegisterAsset(Key, Asset) {
        const Definition = AssetDefinitions.find((Entry) => Entry.Key === Key) || { Key, Label: Asset.Label, Albedo: [0.6, 0.6, 0.62], Roughness: 0.5, Icon: "import" };
        Asset.Key = Key;
        Asset.Definition = Definition;
        Asset.Selector = new ClusterCutSelector(Asset);
        Asset.Discrete = new DiscreteLevelSelector(Asset);
        this.Assets.set(Key, Asset);
    }

    // Assets the current layout needs that are not yet built.
    MissingAssets() { return this.Layout.Assets.filter((Key) => !this.Assets.has(Key)); }

    ApplyLayout(Key, Overrides = {}) {
        const Preset = LayoutPresets[Key] || this.Layout;
        this.Layout = { ...Preset, ...Overrides, Key: LayoutPresets[Key] ? Key : this.Layout.Key };
        this.RebuildInstances();
    }

    RebuildInstances() {
        const Layout = this.Layout;
        const Random = SeededRandom(Layout.Seed);
        const Instances = [];
        const Add = (AssetKey, X, Y, Z, Yaw, Scale, Group) => {
            if (!this.Assets.has(AssetKey)) return;
            const Model = PlacementTransform(X, Y, Z, Yaw, Scale);
            Instances.push({ AssetKey, Model, Inverse: InvertTransform(Model), Scale, Group, Track: ConstructDiscreteTrack(), Occluded: false, Selection: { Clusters: new Uint32Array(256), Count: 0 }, Ranges: null });
        };
        const Rows = Layout.Rows;
        const Half = ((Rows - 1) * Layout.Spacing) / 2;
        if (Layout.Key === "BoulderField") {
            Add("Terrain", 0, 0, 0, 0, 1, "Terrain");
            const Terrain = this.Assets.get("Terrain");
            const Height = Terrain ? ConstructTerrainHeightSampler(Terrain, 256, 240) : () => 0;
            for (let Row = 0; Row < Rows; Row++) for (let Column = 0; Column < Rows; Column++) {
                const X = Column * Layout.Spacing - Half + (Random() - 0.5) * Layout.Spacing * 0.6;
                const Z = Row * Layout.Spacing - Half + (Random() - 0.5) * Layout.Spacing * 0.6;
                const Scale = Layout.ScaleMin + Random() * (Layout.ScaleMax - Layout.ScaleMin);
                if (Math.abs(X) > 118 || Math.abs(Z) > 118) continue;
                Add("Boulder", X, Height(X, Z) + Scale * 0.25, Z, Random() * Math.PI * 2, Scale, "Boulders");
            }
        } else if (Layout.Key === "Colonnade") {
            for (let Index = 0; Index < Rows; Index++) {
                const Z = -Index * Layout.Spacing;
                Add("Column", -6, 0, Z, Random() * 6.28, 1, "Columns");
                Add("Column", 6, 0, Z, Random() * 6.28, 1, "Columns");
                if (Index % 3 === 1) Add("Boulder", (Random() - 0.5) * 6, 0.5, Z - Layout.Spacing / 2, Random() * 6.28, 0.6 + Random() * 0.8, "Rubble");
            }
        } else if (Layout.Key === "KnotGallery") {
            const Count = Rows * 2;
            for (let Index = 0; Index < Count; Index++) {
                const Angle = (Index / Count) * Math.PI * 2;
                const Radius = Layout.Spacing * Rows * 0.35;
                const Scale = Layout.ScaleMin + Random() * (Layout.ScaleMax - Layout.ScaleMin);
                Add("TorusKnot", Math.cos(Angle) * Radius, 5 + Scale, Math.sin(Angle) * Radius, Random() * 6.28, Scale, "Knots");
                Add("Column", Math.cos(Angle) * Radius, 0, Math.sin(Angle) * Radius, 0, 0.62, "Plinths");
            }
            Add("TorusKnot", 0, 12, 0, 0, 6, "Knots");
        } else {
            const Keys = Layout.Assets.filter((Key) => this.Assets.has(Key));
            for (let Row = 0; Row < Rows; Row++) for (let Column = 0; Column < Rows; Column++) {
                if (!Keys.length) break;
                const AssetKey = Keys[Math.floor(Random() * Keys.length)];
                const Scale = Layout.ScaleMin + Random() * (Layout.ScaleMax - Layout.ScaleMin);
                const Y = AssetKey === "TorusKnot" ? 2.2 * Scale : AssetKey === "Boulder" ? Scale * 0.4 : 0;
                Add(AssetKey, Column * Layout.Spacing - Half, Y, Row * Layout.Spacing - Half, Random() * 6.28, AssetKey === "Column" ? Scale * 0.5 : Scale, "Field");
            }
        }
        for (const Instance of Instances) {
            const Asset = this.Assets.get(Instance.AssetKey);
            const S = Asset.AssetSphere;
            const Center = TransformPoint(Instance.Model, S[0], S[1], S[2]);
            Instance.WorldSphere = [Center[0], Center[1], Center[2], S[3] * Instance.Scale];
            Instance.BoxTransform = new Float32Array([Instance.WorldSphere[3], 0, 0, 0, 0, Instance.WorldSphere[3], 0, 0, 0, 0, Instance.WorldSphere[3], 0, Center[0], Center[1], Center[2], 1]);
        }
        this.Instances = Instances;
        this.InstanceGeneration = (this.InstanceGeneration || 0) + 1;
    }

    SceneSphere() {
        if (!this.Instances.length) return [0, 0, 0, 50];
        let MinX = Infinity, MinY = Infinity, MinZ = Infinity, MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
        for (const Instance of this.Instances) {
            const S = Instance.WorldSphere;
            MinX = Math.min(MinX, S[0] - S[3]); MaxX = Math.max(MaxX, S[0] + S[3]);
            MinY = Math.min(MinY, S[1] - S[3]); MaxY = Math.max(MaxY, S[1] + S[3]);
            MinZ = Math.min(MinZ, S[2] - S[3]); MaxZ = Math.max(MaxZ, S[2] + S[3]);
        }
        return [(MinX + MaxX) / 2, (MinY + MaxY) / 2, (MinZ + MaxZ) / 2, Math.hypot(MaxX - MinX, MaxY - MinY, MaxZ - MinZ) / 2];
    }

    SunDirection(Settings) {
        const E = Settings.SunElevation, A = Settings.SunAzimuth;
        return new Float32Array([Math.cos(E) * Math.sin(A), Math.sin(E), Math.cos(E) * Math.cos(A)]);
    }

    // Builds the culling view (possibly frozen) and the render view.
    ResolveViews(Camera, Settings, Width, Height) {
        const Aspect = Width / Math.max(1, Height);
        const ViewProjection = Camera.ViewProjection(Aspect);
        const RenderView = { ViewProjection, Eye: Camera.Eye(), Planes: ExtractViewVolumePlanes(ViewProjection), Scale: ProjectionScale(Height, Camera.Fov), Near: 1e-4, Aspect };
        if (Settings.FreezeCut) {
            if (!this.FrozenView) this.FrozenView = { ...RenderView, Planes: RenderView.Planes.slice(), Eye: RenderView.Eye.slice(), InverseViewProjection: InvertTransform(ViewProjection) };
        } else this.FrozenView = null;
        return { RenderView, CullView: this.FrozenView || RenderView };
    }

    // CPU selection for one instance into Instance.Selection; returns triangle count.
    SelectClusters(Instance, CullView, Settings, Tally) {
        const Asset = this.Assets.get(Instance.AssetKey);
        const LocalEye = TransformPoint(Instance.Inverse, CullView.Eye[0], CullView.Eye[1], CullView.Eye[2]);
        const View = { Eye: LocalEye, Planes: TransformPlanesToLocal(CullView.Planes, Instance.Model), Scale: CullView.Scale, Near: CullView.Near };
        Instance.Selection.Count = 0;
        const Before = Tally.TrianglesDrawn;
        Asset.Selector.SelectInstance(View, Settings, Instance.Selection, Tally);
        Instance.LocalEye = LocalEye;
        return Tally.TrianglesDrawn - Before;
    }

    // Sorted cluster list → merged contiguous vertex ranges.
    ConstructRanges(Instance, Asset) {
        const Selection = Instance.Selection;
        const Sorted = Selection.Clusters.subarray(0, Selection.Count).sort();
        let Ranges = Instance.Ranges;
        if (!Ranges || Ranges.Firsts.length < Selection.Count) {
            const Capacity = Math.max(64, Selection.Count * 2);
            Ranges = Instance.Ranges = { Firsts: new Int32Array(Capacity), Counts: new Int32Array(Capacity), Count: 0 };
        }
        let RangeCount = 0, OpenFirst = -1, OpenEnd = -1;
        const Integers = Asset.ClusterIntegers;
        for (let Slot = 0; Slot < Sorted.length; Slot++) {
            const Cluster = Sorted[Slot];
            const First = Integers[Cluster * ClusterIntegerStride], Count = Integers[Cluster * ClusterIntegerStride + 1] * 3;
            if (First === OpenEnd) OpenEnd += Count;
            else {
                if (OpenFirst >= 0) { Ranges.Firsts[RangeCount] = OpenFirst; Ranges.Counts[RangeCount++] = OpenEnd - OpenFirst; }
                OpenFirst = First; OpenEnd = First + Count;
            }
        }
        if (OpenFirst >= 0) { Ranges.Firsts[RangeCount] = OpenFirst; Ranges.Counts[RangeCount++] = OpenEnd - OpenFirst; }
        Ranges.Count = RangeCount;
        return Ranges;
    }

    // Frame preparation for the WebGL2 path. Renderer supplies occlusion results.
    PrepareFrame(Camera, Settings, Width, Height, Renderer, NowMilliseconds, Picked) {
        const Started = performance.now();
        this.FrameIndex++;
        const { RenderView, CullView } = this.ResolveViews(Camera, Settings, Width, Height);
        ResetSelectionTally(this.Tally);
        ResetSelectionTally(this.CompareTally);
        const Statistics = {
            InstancesTotal: this.Instances.length, InstancesDrawn: 0, InstancesCulledFrustum: 0, InstancesOccluded: 0,
            SourceTriangles: 0, DiscreteTriangles: 0, DiscreteSwitches: 0, DiscreteLevels: new Uint32Array(16), RangeCount: 0, Mode: Settings.Mode,
        };
        const ClusterDraws = [], DiscreteDraws = [], OcclusionTests = [];
        const ClusterMode = Settings.Mode !== "Discrete";
        const DiscreteMode = Settings.Mode !== "Cluster";
        const SunDirection = this.SunDirection(Settings);
        this.Instances.forEach((Instance, InstanceIndex) => {
            const Asset = this.Assets.get(Instance.AssetKey);
            if (!Asset || Asset.ClusterBase === undefined || this.Hidden.has(Instance.AssetKey)) return;
            Statistics.SourceTriangles += Asset.SourceTriangleCount;
            const S = Instance.WorldSphere;
            if (Settings.EnableFrustum && !SphereInsideViewVolume(CullView.Planes, S[0], S[1], S[2], S[3])) { Statistics.InstancesCulledFrustum++; Instance.Selection.Count = 0; return; }
            // Occlusion: one-frame-latent ANY_SAMPLES_PASSED queries on the enclosing cube.
            const Inside = Math.abs(CullView.Eye[0] - S[0]) < S[3] * 1.05 + 0.5 && Math.abs(CullView.Eye[1] - S[1]) < S[3] * 1.05 + 0.5 && Math.abs(CullView.Eye[2] - S[2]) < S[3] * 1.05 + 0.5;
            if (Settings.EnableOcclusion && !Settings.FreezeCut && Renderer && Renderer.ConsumeOcclusion) {
                const Result = Renderer.ConsumeOcclusion(InstanceIndex);
                if (Result !== undefined) Instance.Occluded = !Result;
                if (Inside) Instance.Occluded = false;
                else OcclusionTests.push({ Key: InstanceIndex, BoxTransform: Instance.BoxTransform });
                if (Instance.Occluded) { Statistics.InstancesOccluded++; Instance.Selection.Count = 0; return; }
            } else Instance.Occluded = false;
            Statistics.InstancesDrawn++;
            const Definition = Asset.Definition;
            const Albedo = Settings.TintInstances ? Definition.Albedo : Definition.Albedo;
            if (ClusterMode) {
                this.SelectClusters(Instance, CullView, Settings, this.Tally);
                const Ranges = this.ConstructRanges(Instance, Asset);
                Statistics.RangeCount += Ranges.Count;
                if (Ranges.Count) ClusterDraws.push({ Asset, Model: Instance.Model, Instance: InstanceIndex, Albedo, Roughness: Definition.Roughness, LocalEye: Instance.LocalEye, Firsts: Ranges.Firsts, Counts: Ranges.Counts, RangeCount: Ranges.Count, Discrete: false });
            }
            if (DiscreteMode && Asset.DiscreteTable.length) {
                const LocalEye = TransformPoint(Instance.Inverse, CullView.Eye[0], CullView.Eye[1], CullView.Eye[2]);
                const Before = Instance.Track.Switches;
                Asset.Discrete.Resolve({ Eye: LocalEye, Scale: CullView.Scale, Near: CullView.Near }, Settings, Instance.Track, NowMilliseconds);
                Statistics.DiscreteSwitches += Instance.Track.Switches - Before;
                const Push = (Level, Fade, Invert) => {
                    const Entry = Asset.DiscreteTable[Level];
                    Statistics.DiscreteTriangles += Entry.TriangleCount;
                    Statistics.DiscreteLevels[Level]++;
                    DiscreteDraws.push({ Asset, Model: Instance.Model, Instance: InstanceIndex, Albedo, Roughness: Definition.Roughness, LocalEye, Firsts: new Int32Array([Entry.FirstVertex]), Counts: new Int32Array([Entry.VertexCount]), RangeCount: 1, Discrete: true, Fade, FadeInvert: Invert, Level });
                };
                const Track = Instance.Track;
                Push(Track.Level, Track.PreviousLevel >= 0 ? Track.Fade : 1, false);
                if (Track.PreviousLevel >= 0) Push(Track.PreviousLevel, Track.Fade, true);
            }
        });

        const Views = [];
        if (Settings.Mode === "Cluster") Views.push({ Scissor: null, Draws: ClusterDraws });
        else if (Settings.Mode === "Discrete") Views.push({ Scissor: null, Draws: DiscreteDraws });
        else {
            const Split = Math.round(Width * Settings.SplitFraction);
            Views.push({ Scissor: [0, 0, Split, Height], Draws: DiscreteDraws });
            Views.push({ Scissor: [Split, 0, Width - Split, Height], Draws: ClusterDraws });
        }
        const Lines = this.ConstructDebugLines(Settings, Picked);
        Statistics.CpuMilliseconds = performance.now() - Started;
        Statistics.ClusterTriangles = this.Tally.TrianglesDrawn;
        Statistics.Tally = this.Tally;
        this.Statistics = Statistics;
        return {
            Index: this.FrameIndex,
            ViewProjection: RenderView.ViewProjection,
            CameraPosition: new Float32Array(RenderView.Eye),
            SunDirection,
            SunColour: new Float32Array([1.0 * Settings.SunIntensity / 2.6, 0.93 * Settings.SunIntensity / 2.6, 0.82 * Settings.SunIntensity / 2.6].map((C) => C * 1.1)),
            ProjectionScale: CullView.Scale,
            Settings,
            Views,
            Lines,
            OcclusionTests: Settings.EnableOcclusion ? OcclusionTests : [],
            Picked,
            GroundHeight: this.Layout.Ground ? 0 : -6,
            RenderView, CullView,
        };
    }

    ConstructDebugLines(Settings, Picked) {
        const Lines = [];
        if (this.FrozenView) {
            const Inverse = this.FrozenView.InverseViewProjection;
            const Corners = [];
            for (const Z of [-1, 0.9995]) for (const Y of [-1, 1]) for (const X of [-1, 1]) Corners.push(TransformPoint(Inverse, X, Y, Z));
            // Clamp far corners to a readable distance.
            for (let Index = 4; Index < 8; Index++) {
                const Near = Corners[Index - 4], Far = Corners[Index];
                const D = [Far[0] - Near[0], Far[1] - Near[1], Far[2] - Near[2]];
                const Length = Math.hypot(...D);
                const Cap = Math.min(Length, 400);
                Corners[Index] = [Near[0] + (D[0] / Length) * Cap, Near[1] + (D[1] / Length) * Cap, Near[2] + (D[2] / Length) * Cap];
            }
            const Edges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
            const Positions = new Float32Array(Edges.length * 6);
            Edges.forEach(([A, B], Index) => { Positions.set(Corners[A], Index * 6); Positions.set(Corners[B], Index * 6 + 3); });
            Lines.push({ Positions, Colour: new Float32Array([1.0, 0.75, 0.25, 1]), Overlay: true });
        }
        if (Settings.ShowBounds) {
            const Segments = [];
            for (const Instance of this.Instances) {
                if (!Instance.Selection.Count && !Instance.Occluded) continue;
                CircleSegments(Segments, Instance.WorldSphere, 24);
            }
            if (Segments.length) Lines.push({ Positions: new Float32Array(Segments), Colour: new Float32Array([0.45, 0.75, 1.0, 1]), Overlay: false });
            const Occluded = [];
            for (const Instance of this.Instances) if (Instance.Occluded) CircleSegments(Occluded, Instance.WorldSphere, 24);
            if (Occluded.length) Lines.push({ Positions: new Float32Array(Occluded), Colour: new Float32Array([1.0, 0.35, 0.3, 1]), Overlay: true });
        }
        if (Picked) {
            const Instance = this.Instances[Picked.Instance];
            const Asset = Instance && this.Assets.get(Instance.AssetKey);
            if (Asset && Instance.AssetKey === Picked.AssetKey && Picked.Cluster < Asset.ClusterCount) {
                const F = Picked.Cluster * ClusterFloatStride;
                const Center = TransformPoint(Instance.Model, Asset.ClusterFloats[F], Asset.ClusterFloats[F + 1], Asset.ClusterFloats[F + 2]);
                const Segments = [];
                CircleSegments(Segments, [Center[0], Center[1], Center[2], Asset.ClusterFloats[F + 3] * Instance.Scale], 40);
                Lines.push({ Positions: new Float32Array(Segments), Colour: new Float32Array([1.0, 0.72, 0.22, 1]), Overlay: true });
                const P = Asset.ClusterFloats;
                const ParentCenter = TransformPoint(Instance.Model, P[F + 8], P[F + 9], P[F + 10]);
                if (P[F + 13] < 1e29) {
                    const ParentSegments = [];
                    CircleSegments(ParentSegments, [ParentCenter[0], ParentCenter[1], ParentCenter[2], P[F + 11] * Instance.Scale], 48);
                    Lines.push({ Positions: new Float32Array(ParentSegments), Colour: new Float32Array([0.6, 0.5, 1.0, 1]), Overlay: true });
                }
            }
        }
        return Lines;
    }

    // Instance-local ray against the clusters the current cut draws. Returns the nearest hit.
    RayPick(Origin, Direction, Settings, CullView) {
        let Best = null;
        const Tally = ConstructSelectionTally();
        this.Instances.forEach((Instance, InstanceIndex) => {
            const Asset = this.Assets.get(Instance.AssetKey);
            if (!Asset || Asset.ClusterBase === undefined || this.Hidden.has(Instance.AssetKey)) return;
            const S = Instance.WorldSphere;
            if (RaySphere(Origin, Direction, S[0], S[1], S[2], S[3]) === null) return;
            const LocalOrigin = TransformPoint(Instance.Inverse, Origin[0], Origin[1], Origin[2]);
            const Far = TransformPoint(Instance.Inverse, Origin[0] + Direction[0], Origin[1] + Direction[1], Origin[2] + Direction[2]);
            const LocalDirection = [Far[0] - LocalOrigin[0], Far[1] - LocalOrigin[1], Far[2] - LocalOrigin[2]];
            let Clusters;
            if (Settings.Mode === "Discrete") return;
            if (Instance.Selection.Count && !Settings.ForceFreshSelection) Clusters = Instance.Selection.Clusters.subarray(0, Instance.Selection.Count);
            else {
                this.SelectClusters(Instance, CullView, Settings, Tally);
                Clusters = Instance.Selection.Clusters.subarray(0, Instance.Selection.Count);
            }
            const Floats = new Float32Array(Asset.VertexWords.buffer, Asset.VertexWords.byteOffset, Asset.VertexWords.length);
            for (const Cluster of Clusters) {
                const F = Cluster * ClusterFloatStride;
                if (RaySphere(LocalOrigin, LocalDirection, Asset.ClusterFloats[F], Asset.ClusterFloats[F + 1], Asset.ClusterFloats[F + 2], Asset.ClusterFloats[F + 3]) === null) continue;
                const First = Asset.ClusterIntegers[Cluster * ClusterIntegerStride], Triangles = Asset.ClusterIntegers[Cluster * ClusterIntegerStride + 1];
                for (let Triangle = 0; Triangle < Triangles; Triangle++) {
                    const W = (First + Triangle * 3) * VertexWordStride;
                    const T = RayTriangle(LocalOrigin, LocalDirection, Floats, W, W + VertexWordStride, W + VertexWordStride * 2);
                    if (T !== null && T > 0 && (!Best || T < Best.Distance)) {
                        Best = { Distance: T, Instance: InstanceIndex, Cluster, GlobalCluster: Asset.ClusterBase + Cluster, Triangle, AssetKey: Instance.AssetKey };
                    }
                }
            }
        });
        if (Best) Best.Point = [Origin[0] + Direction[0] * Best.Distance, Origin[1] + Direction[1] * Best.Distance, Origin[2] + Direction[2] * Best.Distance];
        return Best;
    }

    // Detailed readout for the inspector.
    DescribeCluster(Picked, CullView, Settings) {
        const Instance = this.Instances[Picked.Instance];
        const Asset = Instance && this.Assets.get(Instance.AssetKey);
        if (!Asset || Instance.AssetKey !== Picked.AssetKey || Picked.Cluster >= Asset.ClusterCount) return null;
        const F = Picked.Cluster * ClusterFloatStride, I = Picked.Cluster * ClusterIntegerStride;
        const C = Asset.ClusterFloats, N = Asset.ClusterIntegers;
        const Eye = TransformPoint(Instance.Inverse, CullView.Eye[0], CullView.Eye[1], CullView.Eye[2]);
        const Project = (Error, Offset) => (Error * CullView.Scale) / Math.max(Math.hypot(C[F + Offset] - Eye[0], C[F + Offset + 1] - Eye[1], C[F + Offset + 2] - Eye[2]) - C[F + Offset + 3], CullView.Near);
        return {
            Asset, Instance, Level: N[I + 2], Triangles: N[I + 1], Group: N[I + 3] === 0xffffffff ? null : N[I + 3],
            SelfError: C[F + 12] * Instance.Scale, ParentError: C[F + 13] >= 1e29 ? Infinity : C[F + 13] * Instance.Scale,
            SelfProjected: Project(C[F + 12], 4), ParentProjected: C[F + 13] >= 1e29 ? Infinity : Project(C[F + 13], 8),
            Radius: C[F + 3] * Instance.Scale, ConeCutoff: C[F + 17], Threshold: Settings.Threshold,
            Distance: Math.hypot(C[F] - Eye[0], C[F + 1] - Eye[1], C[F + 2] - Eye[2]) * Instance.Scale,
        };
    }

    // Flattened instance records for the WebGPU culling dispatch.
    ConstructGpuInstanceRecords() {
        const Visible = this.Instances.filter((Instance) => {
            const Asset = this.Assets.get(Instance.AssetKey);
            return Asset && Asset.ClusterBase !== undefined && !this.Hidden.has(Instance.AssetKey);
        });
        return Visible.map((Instance) => ({ Instance, Asset: this.Assets.get(Instance.AssetKey), Index: this.Instances.indexOf(Instance) }));
    }
}

function CircleSegments(Out, Sphere, Steps) {
    const [Cx, Cy, Cz, R] = Sphere;
    for (const Plane of [0, 1, 2]) {
        for (let Step = 0; Step < Steps; Step++) {
            const A = (Step / Steps) * Math.PI * 2, B = ((Step + 1) / Steps) * Math.PI * 2;
            const P = (T) => Plane === 0 ? [Cx + Math.cos(T) * R, Cy + Math.sin(T) * R, Cz] : Plane === 1 ? [Cx + Math.cos(T) * R, Cy, Cz + Math.sin(T) * R] : [Cx, Cy + Math.cos(T) * R, Cz + Math.sin(T) * R];
            Out.push(...P(A), ...P(B));
        }
    }
}

function RaySphere(O, D, Cx, Cy, Cz, R) {
    const Lx = O[0] - Cx, Ly = O[1] - Cy, Lz = O[2] - Cz;
    const A = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
    const B = 2 * (Lx * D[0] + Ly * D[1] + Lz * D[2]);
    const C = Lx * Lx + Ly * Ly + Lz * Lz - R * R;
    const Discriminant = B * B - 4 * A * C;
    if (Discriminant < 0) return null;
    const T = (-B + Math.sqrt(Discriminant)) / (2 * A);
    return T < 0 ? null : T;
}

function RayTriangle(O, D, P, A, B, C) {
    const E1x = P[B] - P[A], E1y = P[B + 1] - P[A + 1], E1z = P[B + 2] - P[A + 2];
    const E2x = P[C] - P[A], E2y = P[C + 1] - P[A + 1], E2z = P[C + 2] - P[A + 2];
    const Px = D[1] * E2z - D[2] * E2y, Py = D[2] * E2x - D[0] * E2z, Pz = D[0] * E2y - D[1] * E2x;
    const Det = E1x * Px + E1y * Py + E1z * Pz;
    if (Math.abs(Det) < 1e-14) return null;
    const Inverse = 1 / Det;
    const Tx = O[0] - P[A], Ty = O[1] - P[A + 1], Tz = O[2] - P[A + 2];
    const U = (Tx * Px + Ty * Py + Tz * Pz) * Inverse;
    if (U < 0 || U > 1) return null;
    const Qx = Ty * E1z - Tz * E1y, Qy = Tz * E1x - Tx * E1z, Qz = Tx * E1y - Ty * E1x;
    const V = (D[0] * Qx + D[1] * Qy + D[2] * Qz) * Inverse;
    if (V < 0 || U + V > 1) return null;
    return (E2x * Qx + E2y * Qy + E2z * Qz) * Inverse;
}

// Heights of the terrain's level-0 grid, bilinearly interpolated (for placing instances).
export function ConstructTerrainHeightSampler(Asset, Resolution, Extent) {
    const Row = Resolution + 1;
    const Heights = new Float32Array(Row * Row).fill(NaN);
    const Floats = new Float32Array(Asset.VertexWords.buffer, Asset.VertexWords.byteOffset, Asset.VertexWords.length);
    const Level0 = Asset.LevelSummary[0];
    const End = Asset.ClusterIntegers[(Level0.FirstCluster + Level0.ClusterCount - 1) * ClusterIntegerStride] + Asset.ClusterIntegers[(Level0.FirstCluster + Level0.ClusterCount - 1) * ClusterIntegerStride + 1] * 3;
    for (let Vertex = 0; Vertex < End; Vertex++) {
        const W = Vertex * VertexWordStride;
        const X = Math.round((Floats[W] / Extent + 0.5) * Resolution), Z = Math.round((Floats[W + 2] / Extent + 0.5) * Resolution);
        if (X >= 0 && X <= Resolution && Z >= 0 && Z <= Resolution) Heights[Z * Row + X] = Floats[W + 1];
    }
    return (X, Z) => {
        const U = Math.min(Resolution - 1e-4, Math.max(0, (X / Extent + 0.5) * Resolution));
        const V = Math.min(Resolution - 1e-4, Math.max(0, (Z / Extent + 0.5) * Resolution));
        const X0 = Math.floor(U), Z0 = Math.floor(V), Fx = U - X0, Fz = V - Z0;
        const H = (Xi, Zi) => Heights[Zi * Row + Xi] || 0;
        return (H(X0, Z0) * (1 - Fx) + H(X0 + 1, Z0) * Fx) * (1 - Fz) + (H(X0, Z0 + 1) * (1 - Fx) + H(X0 + 1, Z0 + 1) * Fx) * Fz;
    };
}

export { MultiplyTransforms };
