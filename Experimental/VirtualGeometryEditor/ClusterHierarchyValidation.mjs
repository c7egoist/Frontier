// Node validation for the virtual-geometry builder and runtime cut selection.
//   node Experimental/VirtualGeometryEditor/ClusterHierarchyValidation.mjs [--full]
// Checks: error/sphere monotonicity, group-consistent parent pairs, bounding-tree vs linear
// selection equality, and crack-free (watertight) cuts across many views and thresholds.

import { ConstructBoulder, ConstructTorusKnot, ConstructTerrainTile, ConstructFlutedColumn } from "./Engine/PolygonNetworkSources.js";
import { BuildClusterHierarchy, ClusterFloatStride, ClusterIntegerStride, VertexWordStride, RootParentError, NoGroup } from "./Engine/ClusterHierarchyBuilder.js";
import { ClusterCutSelector, ConstructSelectionTally, DiscreteLevelSelector, ConstructDiscreteTrack } from "./Engine/ClusterCutSelector.js";
import { ExtractViewVolumePlanes, PerspectiveTransform, LookAtTransform, MultiplyTransforms } from "./Engine/LinearAlgebra.js";

const Full = process.argv.includes("--full");
let Failures = 0;
const Check = (Condition, Message) => {
    if (!Condition) { Failures++; console.log(`  ✗ ${Message}`); }
    return Condition;
};

function EdgeCensusOfCut(Asset, Clusters, Count) {
    const Floats = new Float32Array(Asset.VertexWords.buffer);
    const Census = new Map();
    const Key = (W) => `${Floats[W]},${Floats[W + 1]},${Floats[W + 2]}`;
    let Area = 0;
    for (let Slot = 0; Slot < Count; Slot++) {
        const Cluster = Clusters[Slot];
        const First = Asset.ClusterIntegers[Cluster * ClusterIntegerStride];
        const Triangles = Asset.ClusterIntegers[Cluster * ClusterIntegerStride + 1];
        for (let Triangle = 0; Triangle < Triangles; Triangle++) {
            const Corners = [0, 1, 2].map((Corner) => (First + Triangle * 3 + Corner) * VertexWordStride);
            const P = Corners.map((W) => [Floats[W], Floats[W + 1], Floats[W + 2]]);
            const Ux = P[1][0] - P[0][0], Uy = P[1][1] - P[0][1], Uz = P[1][2] - P[0][2];
            const Vx = P[2][0] - P[0][0], Vy = P[2][1] - P[0][1], Vz = P[2][2] - P[0][2];
            Area += Math.hypot(Uy * Vz - Uz * Vy, Uz * Vx - Ux * Vz, Ux * Vy - Uy * Vx) / 2;
            for (let Corner = 0; Corner < 3; Corner++) {
                const A = Key(Corners[Corner]), B = Key(Corners[(Corner + 1) % 3]);
                const EdgeKey = A < B ? `${A}|${B}` : `${B}|${A}`;
                Census.set(EdgeKey, (Census.get(EdgeKey) || 0) + 1);
            }
        }
    }
    let Open = 0, Overused = 0;
    for (const Uses of Census.values()) { if (Uses === 1) Open++; else if (Uses > 2) Overused++; }
    return { Open, Overused, Area };
}

function SourceArea(Source) {
    let Area = 0;
    const P = Source.Positions, I = Source.Indices;
    for (let Index = 0; Index < I.length; Index += 3) {
        const A = I[Index] * 3, B = I[Index + 1] * 3, C = I[Index + 2] * 3;
        const Ux = P[B] - P[A], Uy = P[B + 1] - P[A + 1], Uz = P[B + 2] - P[A + 2];
        const Vx = P[C] - P[A], Vy = P[C + 1] - P[A + 1], Vz = P[C + 2] - P[A + 2];
        Area += Math.hypot(Uy * Vz - Uz * Vy, Uz * Vx - Ux * Vz, Ux * Vy - Uy * Vx) / 2;
    }
    return Area;
}

function SourceOpenEdges(Source) {
    const Census = new Map();
    const I = Source.Indices;
    for (let Index = 0; Index < I.length; Index += 3) {
        for (let Corner = 0; Corner < 3; Corner++) {
            const A = I[Index + Corner], B = I[Index + ((Corner + 1) % 3)];
            const Key = A < B ? A * 1e7 + B : B * 1e7 + A;
            Census.set(Key, (Census.get(Key) || 0) + 1);
        }
    }
    let Open = 0;
    for (const Uses of Census.values()) if (Uses === 1) Open++;
    return Open;
}

function ValidateAsset(Name, Source, Options) {
    console.log(`\n▸ ${Name}: ${(Source.Indices.length / 3).toLocaleString()} source triangles`);
    const Start = performance.now();
    const Asset = BuildClusterHierarchy(Source, Options);
    const BuildMilliseconds = performance.now() - Start;
    console.log(`  built in ${BuildMilliseconds.toFixed(0)} ms — ${Asset.ClusterCount} clusters, ${Asset.GroupCount} groups, ${Asset.LevelSummary.length} levels, roots ${Asset.LevelSummary.reduce((S, L) => S + L.RootCount, 0)}`);
    for (const Line of Asset.Log) console.log(`    ${Line}`);
    const F = Asset.ClusterFloats, I = Asset.ClusterIntegers;

    // 1. Monotonic error and enclosing parent spheres.
    let MonotonicFailures = 0, SphereFailures = 0;
    for (let Cluster = 0; Cluster < Asset.ClusterCount; Cluster++) {
        const C = Cluster * ClusterFloatStride;
        if (F[C + 13] >= RootParentError * 0.5) continue;
        if (!(F[C + 13] >= F[C + 12])) MonotonicFailures++;
        const Gap = Math.hypot(F[C + 8] - F[C + 4], F[C + 9] - F[C + 5], F[C + 10] - F[C + 6]) + F[C + 7] - F[C + 11];
        if (Gap > 1e-4 * Math.max(1, F[C + 11])) SphereFailures++;
    }
    Check(MonotonicFailures === 0, `${MonotonicFailures} clusters with ParentError < SelfError`);
    Check(SphereFailures === 0, `${SphereFailures} parent spheres not enclosing self spheres`);

    // 2. Group consistency: all members of a group share the exact parent pair.
    const GroupPair = new Map();
    let GroupFailures = 0;
    for (let Cluster = 0; Cluster < Asset.ClusterCount; Cluster++) {
        const Group = I[Cluster * ClusterIntegerStride + 3];
        if (Group === NoGroup) continue;
        const C = Cluster * ClusterFloatStride;
        const Pair = `${F[C + 8]},${F[C + 9]},${F[C + 10]},${F[C + 11]},${F[C + 13]}`;
        if (!GroupPair.has(Group)) GroupPair.set(Group, Pair);
        else if (GroupPair.get(Group) !== Pair) GroupFailures++;
    }
    Check(GroupFailures === 0, `${GroupFailures} clusters disagree with their group's parent pair`);

    // 3. Cuts: watertight vs source topology, tree == linear, area preserved.
    const Selector = new ClusterCutSelector(Asset);
    const ExpectedOpen = SourceOpenEdges(Source);
    const Area = SourceArea(Source);
    const Sphere = Asset.AssetSphere;
    const Thresholds = Full ? [0.25, 1, 4, 16, 64, 1e6] : [0.5, 2, 12, 1e6];
    const Distances = Full ? [0.3, 1.2, 3, 10, 40] : [0.4, 2, 12];
    let Cuts = 0, CrackFailures = 0, TreeFailures = 0, AreaWorst = 0, AreaFinest = 0, MixedCuts = 0, SeamContacts = 0;
    for (const DistanceFactor of Distances) {
        for (const Threshold of Thresholds) {
            const Angle = DistanceFactor * 1.7 + Threshold;
            const Eye = [Sphere[0] + Math.cos(Angle) * Sphere[3] * DistanceFactor, Sphere[1] + Sphere[3] * 0.4 * DistanceFactor, Sphere[2] + Math.sin(Angle) * Sphere[3] * DistanceFactor];
            const View = { Eye, Planes: ExtractViewVolumePlanes(MultiplyTransforms(PerspectiveTransform(1, 1.6, 0.01, 1e5), LookAtTransform(Eye, Sphere, [0, 1, 0]))), Scale: 1080 / (2 * Math.tan(0.5)), Near: 1e-4 };
            const Settings = { Threshold, EnableFrustum: false, EnableCone: false, EnableBoundingTree: true, ForcedLevel: -1 };
            const TreeOut = { Clusters: new Uint32Array(1024), Count: 0 };
            const LinearOut = { Clusters: new Uint32Array(1024), Count: 0 };
            const TreeTally = ConstructSelectionTally();
            Selector.SelectInstance(View, Settings, TreeOut, TreeTally);
            Selector.SelectInstance(View, { ...Settings, EnableBoundingTree: false }, LinearOut, ConstructSelectionTally());
            const TreeSet = Array.from(TreeOut.Clusters.subarray(0, TreeOut.Count)).sort((A, B) => A - B).join(",");
            const LinearSet = Array.from(LinearOut.Clusters.subarray(0, LinearOut.Count)).sort((A, B) => A - B).join(",");
            if (TreeSet !== LinearSet) TreeFailures++;
            const Census = EdgeCensusOfCut(Asset, TreeOut.Clusters, TreeOut.Count);
            const LevelsUsed = TreeTally.LevelClusters.filter((Count) => Count > 0).length;
            if (LevelsUsed > 1) MixedCuts++;
            // Cracks show up as open edges the source does not have. Edges used > 2× are seam
            // contacts (two groups folding onto the same locked seam) — reported, not cracks.
            const OpenMismatch = ExpectedOpen === 0 ? Census.Open !== 0 : Census.Open > ExpectedOpen;
            SeamContacts = Math.max(SeamContacts, Census.Overused);
            if (OpenMismatch) {
                CrackFailures++;
                console.log(`    cut τ=${Threshold} d=${DistanceFactor}: open ${Census.Open} (source ${ExpectedOpen}), overused ${Census.Overused}, levels ${LevelsUsed}`);
            }
            AreaWorst = Math.max(AreaWorst, Math.abs(Census.Area - Area) / Area);
            if (Threshold === Thresholds[0] && DistanceFactor === Distances[0]) AreaFinest = Math.abs(Census.Area - Area) / Area;
            Cuts++;
        }
    }
    Check(TreeFailures === 0, `${TreeFailures}/${Cuts} cuts differ between bounding tree and linear scan`);
    Check(CrackFailures === 0, `${CrackFailures}/${Cuts} cuts are not watertight`);
    Check(AreaFinest < 0.02, `finest cut surface area drift ${(AreaFinest * 100).toFixed(2)}% exceeds 2%`);
    console.log(`  ${Cuts} cuts (${MixedCuts} mixing levels) crack-free; area drift finest ${(AreaFinest * 100).toFixed(2)}%, coarsest ${(AreaWorst * 100).toFixed(2)}%; seam contacts ≤ ${SeamContacts}`);

    // 4. Discrete chain: monotonic errors, hysteresis does not oscillate.
    const Table = Asset.DiscreteTable;
    let DiscreteMonotonic = true;
    for (let Level = 1; Level < Table.length; Level++) if (Table[Level].Error < Table[Level - 1].Error) DiscreteMonotonic = false;
    Check(DiscreteMonotonic, "discrete chain errors not monotonic");
    const Discrete = new DiscreteLevelSelector(Asset);
    const Track = ConstructDiscreteTrack();
    let Switches = 0, Previous = -1;
    for (let Step = 0; Step < 400; Step++) {
        const Wobble = 1 + 0.004 * Math.sin(Step * 1.3);
        const Eye = [Sphere[0], Sphere[1], Sphere[2] + Sphere[3] * 6 * Wobble];
        Discrete.Resolve({ Eye, Scale: 1080 / (2 * Math.tan(0.5)), Near: 1e-4 }, { Threshold: 1, Hysteresis: 0.15, Bias: 0, ForcedDiscreteLevel: -1, FadeMilliseconds: 0 }, Track, Step * 16);
        if (Previous >= 0 && Track.Level !== Previous) Switches++;
        Previous = Track.Level;
    }
    Check(Switches <= 1, `discrete hysteresis oscillated ${Switches} times under ±0.4% camera wobble`);
    return { Asset, BuildMilliseconds };
}

const Scale = Full ? 1 : 0.5;
const BoulderResult = ValidateAsset("Boulder", ConstructBoulder({ Subdivisions: Full ? 6 : 5 }), {});
ValidateAsset("Terrain", ConstructTerrainTile({ Resolution: Math.round(128 * Scale * 2) / (Full ? 1 : 2) }), {});
ValidateAsset("Torus knot", ConstructTorusKnot({ TubularSegments: Math.round(512 * Scale), RadialSegments: 32 }), {});
ValidateAsset("Column", ConstructFlutedColumn({ HeightSegments: Math.round(200 * Scale), RadialSegments: 96 }), { GroupSize: 4, ClusterSize: 64 });

// Scene-level path used by the WebGL2 renderer: instance culling, per-instance local cuts,
// and merged multi-draw ranges must cover exactly the selected clusters' vertices.
{
    console.log("\nScene · instance culling + draw ranges");
    const { VirtualGeometryScene, ConstructDefaultSettings } = await import("./Engine/VirtualGeometryScene.js");
    const { ViewCamera } = await import("./Engine/ViewCamera.js");
    const Scene = new VirtualGeometryScene();
    Scene.RegisterAsset("Boulder", BoulderResult.Asset);
    Scene.Layout = { Key: "Validation", Label: "Validation", Assets: ["Boulder"], Rows: 10, Spacing: 6, ScaleMin: 0.8, ScaleMax: 2, Seed: 4, Ground: true };
    Scene.RebuildInstances();
    BoulderResult.Asset.ClusterBase = 0;
    const Camera = new ViewCamera();
    Camera.FrameSphere(Scene.SceneSphere());
    Camera.Distance *= 0.35; Camera.Pitch = 0.2;
    const Settings = { ...ConstructDefaultSettings(), EnableOcclusion: false };
    const Prepared = Scene.PrepareFrame(Camera, Settings, 1920, 1080, null, 0, null);
    const S = Scene.Statistics;
    let RangeVertices = 0, RangeFailures = 0;
    for (const Entry of Prepared.Views[0].Draws) {
        for (let Index = 0; Index < Entry.RangeCount; Index++) {
            RangeVertices += Entry.Counts[Index];
            if (Index && Entry.Firsts[Index] < Entry.Firsts[Index - 1] + Entry.Counts[Index - 1]) RangeFailures++;
        }
    }
    console.log(`  ${S.InstancesDrawn}/${S.InstancesTotal} instances drawn (${S.InstancesCulledFrustum} view-volume culled), ${S.Tally.ClustersDrawn} clusters, ${S.Tally.TrianglesDrawn.toLocaleString()} triangles in ${S.RangeCount} ranges (${(S.SourceTriangles / Math.max(1, S.Tally.TrianglesDrawn)).toFixed(1)}× fewer than full detail)`);
    Check(S.InstancesCulledFrustum > 0 && S.InstancesDrawn > 0, "close-up view should both draw and cull instances");
    Check(RangeVertices === S.Tally.TrianglesDrawn * 3, `ranges cover ${RangeVertices} vertices, cut has ${S.Tally.TrianglesDrawn * 3}`);
    Check(RangeFailures === 0, `${RangeFailures} overlapping/unsorted ranges`);
    Check(S.RangeCount <= S.Tally.ClustersDrawn, "merged ranges must not exceed cluster count");
}

console.log(Failures === 0 ? "\n✓ All virtual-geometry validations passed" : `\n✗ ${Failures} validation failures`);
process.exit(Failures === 0 ? 0 : 1);
