/*==========================================================================================================================================
                                                        NANITERUNTIMEENGINE.JS
==========================================================================================================================================*/
/**
 * 🧩 Nanite Virtual Geometry Runtime Execution Engine
 *
 * Implements:
 *   1. Screen-space projected geometric error calculation & monotonic DAG cut selection.
 *   2. 6-plane camera frustum culling against cluster bounding spheres.
 *   3. Cluster normal-cone backface culling.
 *   4. Freeze Culling & LOD Cut state lock with 3D frozen frustum visualizer.
 *   5. Mixed rendering modes:
 *      - Microfacet PBR Surface Shading
 *      - Nanite Cluster ID Random Colors (UE5 style)
 *      - LOD Hierarchy Level Colors (LOD 0..4)
 *      - Screen Projected Error Heatmap
 *      - Normal-Cone Diagnostics
 *      - Bounding Spheres Visualizer
 *      - Seam-Preserving Wireframe Overlay
 *   6. Multi-instance rigid transform evaluation (100+ instances / millions of virtual triangles).
 */

import * as THREE from '../Vendor/three.esm.min.js';

// Level color mapping: LOD 0 (Lime), LOD 1 (Cyan), LOD 2 (Gold), LOD 3 (Orange), LOD 4+ (Red)
export const LOD_LEVEL_COLORS = [
    [0.18, 0.90, 0.45], // Level 0: Neon Lime
    [0.09, 0.84, 0.95], // Level 1: Vibrant Cyan
    [0.95, 0.75, 0.13], // Level 2: Warm Gold
    [0.95, 0.45, 0.13], // Level 3: Deep Orange
    [0.90, 0.18, 0.18]  // Level 4+: Crimson Red
];

//------------------------------------------------------------------------------------------------------------------------
//                                           CAMERA FRUSTUM EXTRACTOR
//------------------------------------------------------------------------------------------------------------------------

export class CameraFrustumPlanes
{
    constructor()
    {
        // 6 planes: Left, Right, Bottom, Top, Near, Far (each plane: Nx, Ny, Nz, D)
        this.Planes = new Float32Array(24);
    }

    updateFromCamera(Camera)
    {
        Camera.updateMatrixWorld();
        const ViewProj = new THREE.Matrix4().multiplyMatrices(Camera.projectionMatrix, Camera.matrixWorldInverse);
        const m = ViewProj.elements;

        // Left plane: row 4 + row 1
        this.setPlane(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
        // Right plane: row 4 - row 1
        this.setPlane(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
        // Bottom plane: row 4 + row 2
        this.setPlane(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
        // Top plane: row 4 - row 2
        this.setPlane(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
        // Near plane: row 4 + row 3
        this.setPlane(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
        // Far plane: row 4 - row 3
        this.setPlane(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
    }

    setPlane(Idx, A, B, C, D)
    {
        const Len = Math.hypot(A, B, C);
        const InvLen = Len > 1e-8 ? 1.0 / Len : 1.0;
        const Base = Idx * 4;
        this.Planes[Base]     = A * InvLen;
        this.Planes[Base + 1] = B * InvLen;
        this.Planes[Base + 2] = C * InvLen;
        this.Planes[Base + 3] = D * InvLen;
    }

    testSphere(CenterX, CenterY, CenterZ, Radius)
    {
        for (let i = 0; i < 6; ++i)
        {
            const Base = i * 4;
            const Dist = this.Planes[Base] * CenterX +
                         this.Planes[Base + 1] * CenterY +
                         this.Planes[Base + 2] * CenterZ +
                         this.Planes[Base + 3];
            if (Dist < -Radius)
            {
                return false; // Culled by this plane
            }
        }
        return true; // Inside or intersecting frustum
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                           NANITE INSTANCE SPECIFICATION
//------------------------------------------------------------------------------------------------------------------------

export class NaniteInstance
{
    constructor(InstanceId, Name, Pyramid, Translation = [0, 0, 0], Rotation = [0, 0, 0], Scale = [1, 1, 1])
    {
        this.InstanceId = InstanceId;
        this.Name = Name;
        this.Pyramid = Pyramid;
        this.Translation = Translation;
        this.Rotation = Rotation;
        this.Scale = Scale;
        this.Visible = true;

        this.WorldMatrix = new THREE.Matrix4();
        this.updateTransform();
    }

    updateTransform()
    {
        const Euler = new THREE.Euler(this.Rotation[0], this.Rotation[1], this.Rotation[2], 'XYZ');
        const Quat = new THREE.Quaternion().setFromEuler(Euler);
        this.WorldMatrix.compose(
            new THREE.Vector3(...this.Translation),
            Quat,
            new THREE.Vector3(...this.Scale)
        );
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                           NANITE RUNTIME ENGINE
//------------------------------------------------------------------------------------------------------------------------

export class NaniteRuntimeEngine
{
    constructor(Scene, Camera, Renderer)
    {
        this.Scene = Scene;
        this.Camera = Camera;
        this.Renderer = Renderer;

        this.Instances = [];
        this.FrustumPlanes = new CameraFrustumPlanes();

        // Runtime settings & controls
        this.Settings = {
            MaxAllowedPixelError: 1.0,     // [px] Target screen error threshold (default 1.0 px)
            LODBias: 0.0,                  // [-] Screen LOD bias slider (-3..+3)
            EnableFrustumCulling: true,    // View frustum culling
            EnableNormalConeCulling: true, // Cluster backface cone culling
            FreezeCulling: false,          // Freeze camera view for culling inspection
            ShadingMode: 'clusters',       // 'pbr', 'clusters', 'levels', 'error', 'normals'
            WireframeOverlay: false,       // Wireframe edges
            WireframeOpacity: 0.35,        // Wireframe alpha
            ShowBoundingSpheres: false,    // Bounding volumes
            PbrRoughness: 0.38,
            PbrMetalness: 0.12,
            PbrBaseColor: '#e0ded8',
            SunElevation: 48,
            SunAzimuth: 125,
            LightIntensity: 1.4
        };

        // Frozen Camera state
        this.FrozenCameraPosition = new THREE.Vector3();
        this.FrozenCameraFrustum = new CameraFrustumPlanes();
        this.FrozenFrustumHelper = null;

        // Telemetry counters
        this.Telemetry = {
            TotalVirtualTriangles: 0,
            ActiveTriangles: 0,
            TotalClusters: 0,
            ActiveClusters: 0,
            FrustumCulledClusters: 0,
            NormalConeCulledClusters: 0,
            ErrorCulledClusters: 0,
            MaxProjectedPixelError: 0.0,
            MeanProjectedPixelError: 0.0,
            ReductionPercentage: 0.0,
            FrameTimeMs: 0.0,
            FPS: 60,
            LODLevelCounts: [0, 0, 0, 0, 0]
        };

        // Render buffer objects
        this.InstanceMeshes = new Map();
        this.WireframeMeshes = new Map();
        this.BoundingSpheresGroup = new THREE.Group();
        this.Scene.add(this.BoundingSpheresGroup);

        this.createFrozenFrustumHelper();
    }

    createFrozenFrustumHelper()
    {
        const Geom = new THREE.BufferGeometry();
        // 8 frustum corners connected by 12 lines = 24 vertices
        Geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(72), 3));
        const Mat = new THREE.LineBasicMaterial({
            color: 0xff3b30,
            transparent: true,
            opacity: 0.85,
            linewidth: 2
        });
        this.FrozenFrustumHelper = new THREE.LineSegments(Geom, Mat);
        this.FrozenFrustumHelper.visible = false;
        this.Scene.add(this.FrozenFrustumHelper);
    }

    updateFrozenFrustumHelper(Camera)
    {
        if (!this.FrozenFrustumHelper) return;

        Camera.updateMatrixWorld();
        const InvProj = new THREE.Matrix4().copy(Camera.projectionMatrix).invert();
        const CamWorld = Camera.matrixWorld;

        const NDC = [
            // Near plane: 0..3
            -1, -1, -1,
             1, -1, -1,
             1,  1, -1,
            -1,  1, -1,
            // Far plane: 4..7
            -1, -1,  1,
             1, -1,  1,
             1,  1,  1,
            -1,  1,  1
        ];

        const WorldCorners = [];
        for (let i = 0; i < 8; ++i)
        {
            const v = new THREE.Vector3(NDC[i * 3], NDC[i * 3 + 1], NDC[i * 3 + 2]);
            v.applyMatrix4(InvProj);
            v.applyMatrix4(CamWorld);
            WorldCorners.push(v);
        }

        const LineIndices = [
            0, 1, 1, 2, 2, 3, 3, 0, // Near plane
            4, 5, 5, 6, 6, 7, 7, 4, // Far plane
            0, 4, 1, 5, 2, 6, 3, 7  // Connecting sides
        ];

        const PosAttr = this.FrozenFrustumHelper.geometry.attributes.position;
        let vIdx = 0;
        for (let i = 0; i < LineIndices.length; ++i)
        {
            const c = WorldCorners[LineIndices[i]];
            PosAttr.setXYZ(vIdx++, c.x, c.y, c.z);
        }
        PosAttr.needsUpdate = true;
    }

    setFreezeCulling(Freeze)
    {
        this.Settings.FreezeCulling = Freeze;
        if (Freeze)
        {
            this.FrozenCameraPosition.copy(this.Camera.position);
            this.FrozenCameraFrustum.updateFromCamera(this.Camera);
            this.updateFrozenFrustumHelper(this.Camera);
            this.FrozenFrustumHelper.visible = true;
        }
        else
        {
            this.FrozenFrustumHelper.visible = false;
        }
    }

    addInstance(Instance)
    {
        this.Instances.push(Instance);
        this.createInstanceRenderBuffers(Instance);
    }

    clearInstances()
    {
        for (const Mesh of this.InstanceMeshes.values())
        {
            this.Scene.remove(Mesh);
            Mesh.geometry.dispose();
            Mesh.material.dispose();
        }
        for (const Wire of this.WireframeMeshes.values())
        {
            this.Scene.remove(Wire);
            Wire.geometry.dispose();
            Wire.material.dispose();
        }
        this.InstanceMeshes.clear();
        this.WireframeMeshes.clear();
        this.Instances = [];
    }

    createInstanceRenderBuffers(Instance)
    {
        const Pyramid = Instance.Pyramid;
        const VertexCount = Math.floor(Pyramid.Positions.length / 3);

        const Geometry = new THREE.BufferGeometry();
        Geometry.setAttribute('position', new THREE.BufferAttribute(Pyramid.Positions, 3));
        Geometry.setAttribute('normal', new THREE.BufferAttribute(Pyramid.Normals, 3));
        Geometry.setAttribute('uv', new THREE.BufferAttribute(Pyramid.UVs, 2));

        // Vertex color attribute for cluster / level / error shading
        const Colors = new Float32Array(VertexCount * 3);
        Colors.fill(0.8);
        Geometry.setAttribute('color', new THREE.BufferAttribute(Colors, 3));

        // Dynamic index buffer
        const MaxIndices = Pyramid.TotalSourceTriangles * 3 * 2;
        const IndexArray = new Uint32Array(MaxIndices);
        const IndexAttribute = new THREE.BufferAttribute(IndexArray, 1);
        IndexAttribute.setUsage(THREE.DynamicDrawUsage);
        Geometry.setIndex(IndexAttribute);

        // Custom Nanite Shader Material supporting PBR, Cluster IDs, LOD Levels & Heatmap
        const Material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: this.Settings.PbrRoughness,
            metalness: this.Settings.PbrMetalness,
            side: THREE.DoubleSide
        });

        const Mesh = new THREE.Mesh(Geometry, Material);
        Mesh.applyMatrix4(Instance.WorldMatrix);
        Mesh.frustumCulled = false; // We perform our own GPU/CPU cluster-level frustum culling!
        this.Scene.add(Mesh);
        this.InstanceMeshes.set(Instance.InstanceId, Mesh);

        // Wireframe overlay mesh
        const WireGeom = new THREE.BufferGeometry();
        WireGeom.setAttribute('position', Geometry.attributes.position);
        const WireIndexArray = new Uint32Array(MaxIndices * 2);
        const WireIndexAttr = new THREE.BufferAttribute(WireIndexArray, 1);
        WireIndexAttr.setUsage(THREE.DynamicDrawUsage);
        WireGeom.setIndex(WireIndexAttr);

        const WireMat = new THREE.LineBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: this.Settings.WireframeOpacity,
            depthTest: true
        });

        const WireMesh = new THREE.LineSegments(WireGeom, WireMat);
        WireMesh.applyMatrix4(Instance.WorldMatrix);
        WireMesh.frustumCulled = false;
        WireMesh.visible = this.Settings.WireframeOverlay;
        this.Scene.add(WireMesh);
        this.WireframeMeshes.set(Instance.InstanceId, WireMesh);
    }

    /**
     * Executes the Nanite Continuous LOD Cut & Culling pipeline for all instances.
     */
    evaluateLODCut()
    {
        const StartTime = performance.now();

        // Effective camera used for culling & error projection
        let CamPos = this.Camera.position;
        let Frustum = this.FrustumPlanes;

        if (this.Settings.FreezeCulling)
        {
            CamPos = this.FrozenCameraPosition;
            Frustum = this.FrozenCameraFrustum;
        }
        else
        {
            Frustum.updateFromCamera(this.Camera);
        }

        // Screen-space error scalar: PixelsPerRadian = viewportHeight / (2 * tan(FOV/2))
        const ViewportHeight = this.Renderer.domElement.clientHeight || 800;
        const FovRad = (this.Camera.fov * Math.PI) / 180.0;
        const PixelsPerRadian = ViewportHeight / (2.0 * Math.tan(FovRad * 0.5));

        // Effective error threshold including user bias
        const EffectiveThresholdPx = this.Settings.MaxAllowedPixelError * Math.pow(2.0, -this.Settings.LODBias);

        // Reset telemetry counters
        let TotalVirtual = 0;
        let ActiveTriangles = 0;
        let TotalClusters = 0;
        let ActiveClusters = 0;
        let FrustumCulled = 0;
        let NormalConeCulled = 0;
        let ErrorCulled = 0;
        let MaxError = 0.0;
        let SumError = 0.0;
        const LevelDistribution = [0, 0, 0, 0, 0];

        // Clear bounding spheres debug group
        while (this.BoundingSpheresGroup.children.length)
        {
            const Child = this.BoundingSpheresGroup.children.pop();
            Child.geometry.dispose();
            Child.material.dispose();
        }

        // Process each instance
        for (const Instance of this.Instances)
        {
            if (!Instance.Visible) continue;

            const Pyramid = Instance.Pyramid;
            const Mesh = this.InstanceMeshes.get(Instance.InstanceId);
            const WireMesh = this.WireframeMeshes.get(Instance.InstanceId);
            if (!Mesh) continue;

            TotalVirtual += Pyramid.TotalVirtualTriangles;
            TotalClusters += Pyramid.Clusters.length;

            const ActiveIndices = [];
            const ActiveWireIndices = [];
            const Geometry = Mesh.geometry;
            const ColorAttr = Geometry.attributes.color;
            const Colors = ColorAttr.array;

            // Transform camera to instance local space for fast sphere testing
            const InvWorld = new THREE.Matrix4().copy(Instance.WorldMatrix).invert();
            const LocalCamPos = CamPos.clone().applyMatrix4(InvWorld);

            // LOD Cut Selection traversal
            // Nanite Invariant: Render cluster C if (ParentProjectedError > Threshold) && (SelfProjectedError <= Threshold)
            for (const Cluster of Pyramid.Clusters)
            {
                const Cx = Cluster.SphereCenter[0];
                const Cy = Cluster.SphereCenter[1];
                const Cz = Cluster.SphereCenter[2];
                const Radius = Cluster.SphereRadius;

                // 1. Distance to cluster bounding sphere in local space
                const DistToSphere = Math.max(0.1, Math.hypot(Cx - LocalCamPos.x, Cy - LocalCamPos.y, Cz - LocalCamPos.z) - Radius);

                // 2. Project SelfError and ParentError into screen space pixels
                const ProjSelfErrorPx = (Cluster.SelfError * PixelsPerRadian) / DistToSphere;
                const ProjParentErrorPx = (Cluster.ParentError * PixelsPerRadian) / DistToSphere;

                // 3. Monotonic LOD Cut Test
                // Root clusters have ParentError = 1e30, so ProjParentError is huge.
                // Level 0 clusters have SelfError = 0, so ProjSelfError = 0.
                const PassesLODCut = (ProjParentErrorPx > EffectiveThresholdPx) && (ProjSelfErrorPx <= EffectiveThresholdPx);

                if (!PassesLODCut)
                {
                    ErrorCulled++;
                    continue;
                }

                // 4. Frustum Culling
                if (this.Settings.EnableFrustumCulling)
                {
                    // Transform sphere center to world space
                    const WorldCenter = new THREE.Vector3(Cx, Cy, Cz).applyMatrix4(Instance.WorldMatrix);
                    const WorldRadius = Radius * Instance.Scale[0];

                    if (!Frustum.testSphere(WorldCenter.x, WorldCenter.y, WorldCenter.z, WorldRadius))
                    {
                        FrustumCulled++;
                        continue;
                    }
                }

                // 5. Backface Normal-Cone Culling
                if (this.Settings.EnableNormalConeCulling && Cluster.NormalConeSinCutoff < 0.98)
                {
                    const ViewDx = Cx - LocalCamPos.x;
                    const ViewDy = Cy - LocalCamPos.y;
                    const ViewDz = Cz - LocalCamPos.z;
                    const ViewDist = Math.hypot(ViewDx, ViewDy, ViewDz);

                    if (ViewDist > 1e-4)
                    {
                        const VNx = ViewDx / ViewDist;
                        const VNy = ViewDy / ViewDist;
                        const VNz = ViewDz / ViewDist;

                        const ConeDot = Cluster.NormalConeDirection[0] * VNx +
                                        Cluster.NormalConeDirection[1] * VNy +
                                        Cluster.NormalConeDirection[2] * VNz;

                        // If dot with view direction exceeds sin cutoff, cluster faces away from viewer!
                        if (ConeDot > Cluster.NormalConeSinCutoff)
                        {
                            NormalConeCulled++;
                            continue;
                        }
                    }
                }

                // Cluster is SELECTED for rendering!
                ActiveClusters++;
                ActiveTriangles += Cluster.TriangleCount;
                if (ProjSelfErrorPx > MaxError) MaxError = ProjSelfErrorPx;
                SumError += ProjSelfErrorPx;

                const LevelIdx = Math.min(4, Cluster.Level);
                LevelDistribution[LevelIdx]++;

                // Color resolution based on active ShadingMode
                let CR = 0.8, CG = 0.8, CB = 0.8;
                switch (this.Settings.ShadingMode)
                {
                    case 'clusters':
                        CR = Cluster.Color[0];
                        CG = Cluster.Color[1];
                        CB = Cluster.Color[2];
                        break;
                    case 'levels':
                        const LCol = LOD_LEVEL_COLORS[LevelIdx];
                        CR = LCol[0]; CG = LCol[1]; CB = LCol[2];
                        break;
                    case 'error':
                        // Heatmap: Blue (0px) -> Cyan (0.5px) -> Green (1.0px) -> Yellow (1.5px) -> Red (>2.0px)
                        const ErrNorm = Math.min(1.0, ProjSelfErrorPx / Math.max(0.1, EffectiveThresholdPx * 2.0));
                        CR = Math.min(1.0, Math.max(0.0, (ErrNorm - 0.5) * 2.0));
                        CG = Math.sin(ErrNorm * Math.PI);
                        CB = Math.min(1.0, Math.max(0.0, (0.5 - ErrNorm) * 2.0));
                        break;
                    case 'normals':
                        CR = Cluster.NormalConeDirection[0] * 0.5 + 0.5;
                        CG = Cluster.NormalConeDirection[1] * 0.5 + 0.5;
                        CB = Cluster.NormalConeDirection[2] * 0.5 + 0.5;
                        break;
                    case 'pbr':
                    default:
                        // PBR base albedo
                        const Hex = parseInt(this.Settings.PbrBaseColor.replace('#', ''), 16);
                        CR = ((Hex >> 16) & 255) / 255;
                        CG = ((Hex >> 8) & 255) / 255;
                        CB = (Hex & 255) / 255;
                        break;
                }

                // Write vertex colors for this cluster's triangles
                const ClustTris = Math.floor(Cluster.Indices.length / 3);
                for (let t = 0; t < ClustTris; ++t)
                {
                    const v0 = Cluster.Indices[t * 3];
                    const v1 = Cluster.Indices[t * 3 + 1];
                    const v2 = Cluster.Indices[t * 3 + 2];

                    ActiveIndices.push(v0, v1, v2);

                    Colors[v0 * 3]     = CR; Colors[v0 * 3 + 1] = CG; Colors[v0 * 3 + 2] = CB;
                    Colors[v1 * 3]     = CR; Colors[v1 * 3 + 1] = CG; Colors[v1 * 3 + 2] = CB;
                    Colors[v2 * 3]     = CR; Colors[v2 * 3 + 1] = CG; Colors[v2 * 3 + 2] = CB;

                    if (this.Settings.WireframeOverlay)
                    {
                        ActiveWireIndices.push(v0, v1, v1, v2, v2, v0);
                    }
                }

                // Debug Bounding Sphere
                if (this.Settings.ShowBoundingSpheres && ActiveClusters <= 180)
                {
                    const SphereGeo = new THREE.SphereGeometry(Radius, 10, 8);
                    const SphereMat = new THREE.MeshBasicMaterial({
                        color: new THREE.Color(CR, CG, CB),
                        wireframe: true,
                        transparent: true,
                        opacity: 0.35
                    });
                    const SphereMesh = new THREE.Mesh(SphereGeo, SphereMat);
                    SphereMesh.position.set(Cx, Cy, Cz);
                    SphereMesh.applyMatrix4(Instance.WorldMatrix);
                    this.BoundingSpheresGroup.add(SphereMesh);
                }
            }

            // Upload active index buffer to GPU
            const IndexAttr = Geometry.getIndex();
            IndexAttr.copyArray(ActiveIndices);
            Geometry.setDrawRange(0, ActiveIndices.length);
            IndexAttr.needsUpdate = true;
            ColorAttr.needsUpdate = true;

            // Wireframe mesh update
            if (WireMesh)
            {
                WireMesh.visible = this.Settings.WireframeOverlay;
                if (this.Settings.WireframeOverlay)
                {
                    const WireAttr = WireMesh.geometry.getIndex();
                    WireAttr.copyArray(ActiveWireIndices);
                    WireMesh.geometry.setDrawRange(0, ActiveWireIndices.length);
                    WireAttr.needsUpdate = true;
                    WireMesh.material.opacity = this.Settings.WireframeOpacity;
                }
            }

            // Update PBR material properties
            Mesh.material.roughness = this.Settings.PbrRoughness;
            Mesh.material.metalness = this.Settings.PbrMetalness;
        }

        // Tally telemetry
        const ElapsedMs = performance.now() - StartTime;
        const ReductionPct = TotalVirtual > 0 ? (1.0 - (ActiveTriangles / TotalVirtual)) * 100.0 : 0.0;

        this.Telemetry.TotalVirtualTriangles = TotalVirtual;
        this.Telemetry.ActiveTriangles = ActiveTriangles;
        this.Telemetry.TotalClusters = TotalClusters;
        this.Telemetry.ActiveClusters = ActiveClusters;
        this.Telemetry.FrustumCulledClusters = FrustumCulled;
        this.Telemetry.NormalConeCulledClusters = NormalConeCulled;
        this.Telemetry.ErrorCulledClusters = ErrorCulled;
        this.Telemetry.MaxProjectedPixelError = MaxError;
        this.Telemetry.MeanProjectedPixelError = ActiveClusters > 0 ? SumError / ActiveClusters : 0.0;
        this.Telemetry.ReductionPercentage = Math.max(0.0, Math.min(100.0, ReductionPct));
        this.Telemetry.FrameTimeMs = ElapsedMs;
        this.Telemetry.FPS = Math.round(1000.0 / Math.max(1.0, ElapsedMs));
        this.Telemetry.LODLevelCounts = LevelDistribution;
    }
}
