// Runtime LOD selection.
//   • ClusterCutSelector — per-instance DAG cut: draw cluster c iff
//         ProjectedError(c.Self) ≤ τ  <  ProjectedError(c.Parent)
//     evaluated in instance-local space, accelerated by the per-level bounding tree
//     (frustum test + conservative error bounds prune whole subtrees), with optional
//     backface normal-cone culling and a forced-level isolation mode.
//   • DiscreteLevelSelector — classic whole-network LOD with screen-space error,
//     hysteresis band, bias, clamps, and dithered cross-fade bookkeeping.

import {
    ClusterFloatStride, ClusterIntegerStride, BoundingNodeFloatStride, BoundingNodeIntegerStride,
} from "./ClusterHierarchyBuilder.js";

export function ProjectionScale(ViewportHeightPixels, VerticalFov) {
    return ViewportHeightPixels / (2 * Math.tan(VerticalFov / 2));
}

// Same expression is mirrored in the WebGPU culling shader and the validation script.
export function ProjectedSphereError(Error, Cx, Cy, Cz, Radius, Eye, Scale, Near) {
    const Distance = Math.hypot(Cx - Eye[0], Cy - Eye[1], Cz - Eye[2]) - Radius;
    return (Error * Scale) / Math.max(Distance, Near);
}

export function ConstructSelectionTally() {
    return {
        NodesVisited: 0, NodesCulledFrustum: 0, NodesPrunedError: 0,
        ClustersTested: 0, ClustersCulledFrustum: 0, ClustersCulledCone: 0, ClustersRejectedLevel: 0,
        ClustersDrawn: 0, TrianglesDrawn: 0, LevelClusters: new Uint32Array(32), LevelTriangles: new Uint32Array(32),
    };
}

export function ResetSelectionTally(Tally) {
    for (const Key of Object.keys(Tally)) {
        if (Tally[Key] instanceof Uint32Array) Tally[Key].fill(0);
        else Tally[Key] = 0;
    }
}

export class ClusterCutSelector {
    constructor(Asset) {
        this.Asset = Asset;
        this.Floats = Asset.ClusterFloats;
        this.Integers = Asset.ClusterIntegers;
        this.NodeFloats = Asset.BoundingNodeFloats;
        this.NodeIntegers = Asset.BoundingNodeIntegers;
        this.LeafClusters = Asset.BoundingLeafClusters;
        this.Stack = new Int32Array(Math.max(64, Asset.BoundingNodeCount));
    }

    // View: { Eye: local eye [3], Planes: local planes (24), Scale, Near }
    // Settings: { Threshold, EnableFrustum, EnableCone, EnableBoundingTree, ForcedLevel }
    // Output: { Clusters: Uint32Array, Count } — appended, caller resets Count.
    SelectInstance(View, Settings, Output, Tally) {
        if (Settings.EnableBoundingTree) this.SelectWithTree(View, Settings, Output, Tally);
        else for (let Cluster = 0; Cluster < this.Asset.ClusterCount; Cluster++) this.TestCluster(Cluster, View, Settings, Output, Tally);
    }

    SelectWithTree(View, Settings, Output, Tally) {
        const NF = this.NodeFloats, NI = this.NodeIntegers;
        const Eye = View.Eye, Planes = View.Planes, Scale = View.Scale, Near = View.Near, Threshold = Settings.Threshold;
        let Stack = this.Stack;
        let Top = 0;
        Stack[Top++] = 0;
        while (Top > 0) {
            const Node = Stack[--Top];
            Tally.NodesVisited++;
            const F = Node * BoundingNodeFloatStride, I = Node * BoundingNodeIntegerStride;
            if (Settings.EnableFrustum && !SphereVisible(Planes, NF[F], NF[F + 1], NF[F + 2], NF[F + 3])) { Tally.NodesCulledFrustum++; continue; }
            const Level = NI[I + 3];
            if (Settings.ForcedLevel >= 0) {
                if (Level >= 0 && Level !== Settings.ForcedLevel) { Tally.NodesPrunedError++; continue; }
            } else if (Level >= 0) {
                // No cluster below can have Parent projected > τ → nothing to draw here.
                const ParentDistance = Math.hypot(NF[F + 4] - Eye[0], NF[F + 5] - Eye[1], NF[F + 6] - Eye[2]) - NF[F + 7];
                if ((NF[F + 12] * Scale) / Math.max(ParentDistance, Near) <= Threshold) { Tally.NodesPrunedError++; continue; }
                // Every cluster below is too coarse (Self projected > τ even at farthest point).
                const SelfDistance = Math.hypot(NF[F + 8] - Eye[0], NF[F + 9] - Eye[1], NF[F + 10] - Eye[2]) + NF[F + 11];
                if ((NF[F + 13] * Scale) / Math.max(SelfDistance, Near) > Threshold) { Tally.NodesPrunedError++; continue; }
            }
            if (NI[I + 2]) {
                const First = NI[I], Count = NI[I + 1];
                for (let Slot = First; Slot < First + Count; Slot++) this.TestCluster(this.LeafClusters[Slot], View, Settings, Output, Tally);
            } else {
                const First = NI[I], Count = NI[I + 1];
                if (Top + Count > Stack.length) { const Grown = new Int32Array(Math.max(Stack.length * 2, Top + Count)); Grown.set(Stack); Stack = this.Stack = Grown; }
                for (let Nested = First + Count - 1; Nested >= First; Nested--) Stack[Top++] = Nested;
            }
        }
    }

    TestCluster(Cluster, View, Settings, Output, Tally) {
        const C = this.Floats, F = Cluster * ClusterFloatStride;
        const Eye = View.Eye;
        Tally.ClustersTested++;
        const Level = this.Integers[Cluster * ClusterIntegerStride + 2];
        if (Settings.ForcedLevel >= 0) {
            if (Level !== Settings.ForcedLevel) { Tally.ClustersRejectedLevel++; return; }
        } else {
            const SelfDistance = Math.hypot(C[F + 4] - Eye[0], C[F + 5] - Eye[1], C[F + 6] - Eye[2]) - C[F + 7];
            if ((C[F + 12] * View.Scale) / Math.max(SelfDistance, View.Near) > Settings.Threshold) { Tally.ClustersRejectedLevel++; return; }
            const ParentDistance = Math.hypot(C[F + 8] - Eye[0], C[F + 9] - Eye[1], C[F + 10] - Eye[2]) - C[F + 11];
            if ((C[F + 13] * View.Scale) / Math.max(ParentDistance, View.Near) <= Settings.Threshold) { Tally.ClustersRejectedLevel++; return; }
        }
        if (Settings.EnableFrustum && !SphereVisible(View.Planes, C[F], C[F + 1], C[F + 2], C[F + 3])) { Tally.ClustersCulledFrustum++; return; }
        if (Settings.EnableCone && C[F + 17] < 1) {
            const Dx = C[F] - Eye[0], Dy = C[F + 1] - Eye[1], Dz = C[F + 2] - Eye[2];
            if (Dx * C[F + 14] + Dy * C[F + 15] + Dz * C[F + 16] >= C[F + 17] * Math.hypot(Dx, Dy, Dz) + C[F + 3]) { Tally.ClustersCulledCone++; return; }
        }
        if (Output.Count === Output.Clusters.length) {
            const Grown = new Uint32Array(Output.Clusters.length * 2);
            Grown.set(Output.Clusters);
            Output.Clusters = Grown;
        }
        Output.Clusters[Output.Count++] = Cluster;
        const Triangles = this.Integers[Cluster * ClusterIntegerStride + 1];
        Tally.ClustersDrawn++;
        Tally.TrianglesDrawn += Triangles;
        if (Level < 32) { Tally.LevelClusters[Level]++; Tally.LevelTriangles[Level] += Triangles; }
    }
}

function SphereVisible(Planes, X, Y, Z, Radius) {
    for (let Index = 0; Index < 24; Index += 4) {
        if (Planes[Index] * X + Planes[Index + 1] * Y + Planes[Index + 2] * Z + Planes[Index + 3] < -Radius) return false;
    }
    return true;
}

export class DiscreteLevelSelector {
    constructor(Asset) {
        this.Asset = Asset;
        this.Table = Asset.DiscreteTable;
        this.Sphere = Asset.AssetSphere;
    }

    // Returns the coarsest level whose projected error stays ≤ Threshold·Factor.
    CoarsestWithin(View, Threshold, Factor) {
        const S = this.Sphere;
        let Chosen = 0;
        for (let Level = 0; Level < this.Table.length; Level++) {
            if (ProjectedSphereError(this.Table[Level].Error, S[0], S[1], S[2], S[3], View.Eye, View.Scale, View.Near) <= Threshold * Factor) Chosen = Level;
            else break;
        }
        return Chosen;
    }

    // Track: { Level, PreviousLevel, FadeStart } persistent per instance.
    Resolve(View, Settings, Track, NowMilliseconds) {
        const LastLevel = this.Table.length - 1;
        let Target;
        if (Settings.ForcedDiscreteLevel >= 0) {
            Target = Math.min(LastLevel, Settings.ForcedDiscreteLevel);
        } else {
            const Desired = this.CoarsestWithin(View, Settings.Threshold, 1);
            const Comfortable = this.CoarsestWithin(View, Settings.Threshold, 1 - Settings.Hysteresis);
            let Current = Track.Unbiased < 0 ? Desired : Track.Unbiased;
            if (Desired < Current) Current = Desired;               // must refine immediately
            else if (Comfortable > Current) Current = Comfortable;  // coarsen only past the band
            Track.Unbiased = Current;
            Target = Math.max(0, Math.min(LastLevel, Current + Settings.Bias));
        }
        if (Track.Level !== Target) {
            if (Track.Level >= 0 && Settings.FadeMilliseconds > 0) {
                Track.PreviousLevel = Track.Level;
                Track.FadeStart = NowMilliseconds;
            } else {
                Track.PreviousLevel = -1;
            }
            if (Track.Level >= 0) Track.Switches = (Track.Switches || 0) + 1;
            Track.Level = Target;
        }
        let Fade = 1;
        if (Track.PreviousLevel >= 0) {
            Fade = Settings.FadeMilliseconds > 0 ? (NowMilliseconds - Track.FadeStart) / Settings.FadeMilliseconds : 1;
            if (Fade >= 1) { Fade = 1; Track.PreviousLevel = -1; }
        }
        Track.Fade = Fade;
        return Track;
    }
}

export function ConstructDiscreteTrack() {
    return { Level: -1, Unbiased: -1, PreviousLevel: -1, FadeStart: 0, Fade: 1, Switches: 0 };
}
