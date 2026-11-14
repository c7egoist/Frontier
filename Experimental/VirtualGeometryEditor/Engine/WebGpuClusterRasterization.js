// WebGPU GPU-driven cluster path.
//   ClusterCullSequence (compute, one thread per instance × cluster):
//       instance view-volume test → instance occlusion (previous frame's occlusion-query
//       results resolved straight into a storage buffer, no CPU readback) → DAG cut test
//       Self ≤ τ < Parent → cluster view-volume test → backface normal cone → append
//       (instance, cluster) to the visible list and bump the indirect instance count.
//   ClusterRasterization: one drawIndirect; vertex pulling from storage buffers, every
//       indirect instance is one cluster (vertices past the cluster's triangle count collapse).
//   Statistics counters and timestamps are read back asynchronously (never stalls a frame).

import { InvertTransform } from "./LinearAlgebra.js";
import { VertexWordStride, ClusterFloatStride, ClusterIntegerStride, NoGroup } from "./ClusterHierarchyBuilder.js";

const CounterCount = 48;
const ClusterRecordBytes = 96;
const InstanceRecordBytes = 176;
const UniformBytes = 336;
const MaxOcclusionQueries = 4096;

const SharedDeclarations = /* wgsl */ `
struct Uniforms {
    ViewProjection: mat4x4f,
    CullPlanes: array<vec4f, 6>,
    CullEye: vec4f,
    CameraPosition: vec4f,
    SunDirection: vec4f,
    SunColour: vec4f,
    Params: vec4f,
    Switches: vec4u,
    Picked: vec4u,
    InverseViewProjection: mat4x4f,
};
struct ClusterRecord {
    CullSphere: vec4f,
    SelfSphere: vec4f,
    ParentSphere: vec4f,
    Errors: vec4f,
    ConeAxis: vec4f,
    Meta: vec4u,
};
struct InstanceRecord {
    Model: mat4x4f,
    Inverse: mat4x4f,
    WorldSphere: vec4f,
    Meta: vec4u,
    Material: vec4f,
};
fn HashScalar(Seed: u32) -> u32 {
    var X = Seed;
    X ^= X >> 16u; X *= 0x7feb352du; X ^= X >> 15u; X *= 0x846ca68bu; X ^= X >> 16u;
    return X;
}
fn HashColour(Seed: u32) -> vec3f {
    let H = HashScalar(Seed);
    let C = vec3f(f32(H & 255u), f32((H >> 8u) & 255u), f32((H >> 16u) & 255u)) / 255.0;
    return mix(vec3f(0.18), C, 0.85);
}
const LevelStops = array<vec3f, 12>(vec3f(0.20,0.45,1.00), vec3f(0.10,0.72,0.95), vec3f(0.10,0.85,0.70), vec3f(0.25,0.85,0.35), vec3f(0.60,0.88,0.20), vec3f(0.92,0.88,0.18), vec3f(1.00,0.70,0.15), vec3f(1.00,0.50,0.12), vec3f(0.95,0.28,0.22), vec3f(0.88,0.22,0.48), vec3f(0.72,0.25,0.80), vec3f(0.92,0.88,0.96));
fn LevelColour(Level: u32) -> vec3f {
    var Stops = LevelStops;
    return Stops[min(Level, 11u)];
}
fn HeatColour(Ratio: f32) -> vec3f {
    let T = clamp(Ratio, 0.0, 1.5);
    let Cool = vec3f(0.10, 0.20, 0.60); let Mid = vec3f(0.15, 0.75, 0.55); let Warm = vec3f(1.0, 0.82, 0.25); let Hot = vec3f(1.0, 0.2, 0.15);
    if (T < 0.5) { return mix(Cool, Mid, T * 2.0); }
    if (T < 1.0) { return mix(Mid, Warm, (T - 0.5) * 2.0); }
    return mix(Warm, Hot, (T - 1.0) * 2.0);
}
fn ToneMap(Linear: vec3f) -> vec3f {
    let C = (Linear * (2.51 * Linear + 0.03)) / (Linear * (2.43 * Linear + 0.59) + 0.14);
    return pow(clamp(C, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
}
`;

const CullSource = /* wgsl */ `${SharedDeclarations}
@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> Clusters: array<ClusterRecord>;
@group(0) @binding(2) var<storage, read> Instances: array<InstanceRecord>;
@group(0) @binding(3) var<storage, read_write> Visible: array<vec2u>;
@group(0) @binding(4) var<storage, read_write> Indirect: array<atomic<u32>, 4>;
@group(0) @binding(5) var<storage, read_write> Counters: array<atomic<u32>, ${CounterCount}>;
@group(0) @binding(6) var<storage, read> Occlusion: array<u32>;

var<workgroup> RejectedLevel: atomic<u32>;
var<workgroup> RejectedFrustum: atomic<u32>;
var<workgroup> RejectedCone: atomic<u32>;

fn SphereVisible(Center: vec3f, Radius: f32) -> bool {
    for (var Plane = 0u; Plane < 6u; Plane++) {
        if (dot(U.CullPlanes[Plane].xyz, Center) + U.CullPlanes[Plane].w < -Radius) { return false; }
    }
    return true;
}

@compute @workgroup_size(64)
fn CullClusters(@builtin(global_invocation_id) Gid: vec3u, @builtin(local_invocation_index) LocalIndex: u32) {
    // Outcome: 0 idle, 1 level rejected, 2 cluster frustum, 3 cone, 4 visible, 5 instance rejected.
    var Outcome = 0u;
    let InstanceSlot = Gid.y;
    let Switches = U.Switches.x;
    if (InstanceSlot < U.Picked.w) {
        let Inst = Instances[InstanceSlot];
        let Local = Gid.x;
        if (Local < Inst.Meta.y) {
            let WS = Inst.WorldSphere;
            var InstanceVisible = true;
            if ((Switches & 1u) != 0u && !SphereVisible(WS.xyz, WS.w)) {
                InstanceVisible = false;
                if (Local == 0u) { atomicAdd(&Counters[2], 1u); }
            } else if ((Switches & 4u) != 0u) {
                let Inside = all(abs(U.CullEye.xyz - WS.xyz) < vec3f(WS.w * 1.05 + 0.5));
                if (!Inside && Occlusion[Inst.Meta.w * 2u] == 0u) {
                    InstanceVisible = false;
                    if (Local == 0u) { atomicAdd(&Counters[3], 1u); }
                }
            }
            if (!InstanceVisible) {
                Outcome = 5u;
            } else {
                if (Local == 0u) { atomicAdd(&Counters[4], 1u); }
                let C = Clusters[Inst.Meta.x + Local];
                let LocalEye = (Inst.Inverse * vec4f(U.CullEye.xyz, 1.0)).xyz;
                let Scale = U.CullEye.w;
                let Near = U.Params.y;
                let Threshold = U.Params.x;
                Outcome = 4u;
                if ((Switches & 8u) != 0u) {
                    if (C.Meta.z != U.Switches.y) { Outcome = 1u; }
                } else {
                    let SelfDistance = max(distance(C.SelfSphere.xyz, LocalEye) - C.SelfSphere.w, Near);
                    let ParentDistance = max(distance(C.ParentSphere.xyz, LocalEye) - C.ParentSphere.w, Near);
                    if (C.Errors.x * Scale / SelfDistance > Threshold || C.Errors.y * Scale / ParentDistance <= Threshold) { Outcome = 1u; }
                }
                if (Outcome == 4u && (Switches & 1u) != 0u) {
                    let WorldCenter = (Inst.Model * vec4f(C.CullSphere.xyz, 1.0)).xyz;
                    let InstanceScale = length(Inst.Model[0].xyz);
                    if (!SphereVisible(WorldCenter, C.CullSphere.w * InstanceScale)) { Outcome = 2u; }
                }
                if (Outcome == 4u && (Switches & 2u) != 0u && C.Errors.z < 1.0) {
                    let D = C.CullSphere.xyz - LocalEye;
                    if (dot(D, C.ConeAxis.xyz) >= C.Errors.z * length(D) + C.CullSphere.w) { Outcome = 3u; }
                }
                if (Outcome == 4u) {
                    let Slot = atomicAdd(&Counters[0], 1u);
                    if (Slot < U.Picked.z) {
                        Visible[Slot] = vec2u(InstanceSlot, Inst.Meta.x + Local);
                        atomicAdd(&Indirect[1], 1u);
                        atomicAdd(&Counters[1], C.Meta.y);
                        atomicAdd(&Counters[16u + min(C.Meta.z, 31u)], 1u);
                    }
                }
            }
        }
    }
    if (Outcome == 1u) { atomicAdd(&RejectedLevel, 1u); }
    if (Outcome == 2u) { atomicAdd(&RejectedFrustum, 1u); }
    if (Outcome == 3u) { atomicAdd(&RejectedCone, 1u); }
    workgroupBarrier();
    if (LocalIndex == 0u) {
        atomicAdd(&Counters[5], atomicLoad(&RejectedLevel));
        atomicAdd(&Counters[6], atomicLoad(&RejectedFrustum));
        atomicAdd(&Counters[7], atomicLoad(&RejectedCone));
    }
}
`;

const RasterSource = /* wgsl */ `${SharedDeclarations}
@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> Clusters: array<ClusterRecord>;
@group(0) @binding(2) var<storage, read> Instances: array<InstanceRecord>;
@group(0) @binding(3) var<storage, read> Visible: array<vec2u>;
@group(0) @binding(4) var<storage, read> Vertices: array<u32>;

struct Varyings {
    @builtin(position) Position: vec4f,
    @location(0) World: vec3f,
    @location(1) Normal: vec3f,
    @location(2) Barycentric: vec3f,
    @location(3) @interpolate(flat) Ids: vec4u,
    @location(4) @interpolate(flat) Material: vec4f,
    @location(5) @interpolate(flat) ErrorRatio: f32,
};

fn OctDecode(E: vec2f) -> vec3f {
    var N = vec3f(E, 1.0 - abs(E.x) - abs(E.y));
    let T = max(-N.z, 0.0);
    N.x += select(T, -T, N.x >= 0.0);
    N.y += select(T, -T, N.y >= 0.0);
    return normalize(N);
}

@vertex
fn VertexMain(@builtin(vertex_index) VertexIndex: u32, @builtin(instance_index) DrawIndex: u32) -> Varyings {
    var Out: Varyings;
    let Entry = Visible[DrawIndex];
    let Inst = Instances[Entry.x];
    let C = Clusters[Entry.y];
    if (VertexIndex >= C.Meta.y * 3u) {
        Out.Position = vec4f(0.0, 0.0, -2.0, 1.0);
        return Out;
    }
    let W = (C.Meta.x + VertexIndex) * ${VertexWordStride}u;
    let Local = vec3f(bitcast<f32>(Vertices[W]), bitcast<f32>(Vertices[W + 1u]), bitcast<f32>(Vertices[W + 2u]));
    let Normal = OctDecode(unpack2x16snorm(Vertices[W + 3u]));
    let Packed = Vertices[W + 5u];
    let World = Inst.Model * vec4f(Local, 1.0);
    Out.Position = U.ViewProjection * World;
    Out.World = World.xyz;
    Out.Normal = (Inst.Model * vec4f(Normal, 0.0)).xyz;
    let Corner = (Packed >> 8u) & 3u;
    Out.Barycentric = select(select(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), Corner == 1u), vec3f(1.0, 0.0, 0.0), Corner == 0u);
    Out.Ids = vec4u(Entry.y, Packed, Inst.Meta.z, C.Meta.w);
    Out.Material = Inst.Material;
    let LocalEye = (Inst.Inverse * vec4f(U.CullEye.xyz, 1.0)).xyz;
    let SelfDistance = max(distance(C.SelfSphere.xyz, LocalEye) - C.SelfSphere.w, U.Params.y);
    Out.ErrorRatio = (C.Errors.x * U.CullEye.w / SelfDistance) / max(U.Params.x, 1e-6);
    return Out;
}

@fragment
fn FragmentMain(In: Varyings, @builtin(front_facing) FrontFacing: bool) -> @location(0) vec4f {
    var N = normalize(In.Normal);
    if (!FrontFacing) { N = -N; }
    let V = normalize(U.CameraPosition.xyz - In.World);
    let L = normalize(U.SunDirection.xyz);
    let Lambert = max(dot(N, L), 0.0);
    let Cluster = In.Ids.x;
    let Packed = In.Ids.y;
    let Level = (Packed >> 10u) & 63u;
    let Triangle = Packed & 255u;
    let DebugView = U.Switches.z;
    var Base = In.Material.rgb;
    if (DebugView == 1u) { Base = HashColour(Cluster * 7919u + 13u); }
    else if (DebugView == 2u) { Base = select(HashColour(In.Ids.w * 104729u + 7u), HashColour(Cluster) * 0.6, In.Ids.w == 0xffffffffu); }
    else if (DebugView == 3u) { Base = LevelColour(Level); }
    else if (DebugView == 4u) { Base = HashColour((Cluster * 256u + Triangle) * 2654435761u + 1u); }
    else if (DebugView == 5u) { Base = HeatColour(In.ErrorRatio); }
    else if (DebugView == 6u) { Base = HashColour(In.Ids.z * 31337u + 3u); }
    else if (DebugView == 7u) { Base = N * 0.5 + 0.5; }
    var Lit: vec3f;
    if (DebugView == 7u) { Lit = Base * Base; }
    else if (DebugView != 0u) { Lit = Base * Base * (0.30 + 0.85 * Lambert) + Base * Base * 0.15 * (N.y * 0.5 + 0.5); }
    else {
        let Roughness = In.Material.w;
        let H = normalize(L + V);
        let Shine = mix(8.0, 96.0, 1.0 - Roughness);
        let Specular = pow(max(dot(N, H), 0.0), Shine) * (Shine + 8.0) / 25.0 * (1.0 - Roughness) * 0.35;
        let Fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0) * 0.18;
        let Sky = mix(vec3f(0.20, 0.18, 0.16), vec3f(0.42, 0.52, 0.68), N.y * 0.5 + 0.5);
        Lit = Base * (Sky * 0.42 + U.SunColour.rgb * Lambert) + U.SunColour.rgb * Specular * Lambert + Sky * Fresnel;
    }
    if ((U.Switches.w & 1u) != 0u) {
        let Width = fwidth(In.Barycentric);
        let Edge = smoothstep(vec3f(0.0), Width * 1.1, In.Barycentric);
        let Line = 1.0 - min(min(Edge.x, Edge.y), Edge.z);
        Lit = mix(Lit, select(vec3f(0.02, 0.025, 0.03), Lit * 0.25, DebugView != 0u), Line * 0.85);
    }
    if (U.Picked.x != 0u && Cluster + 1u == U.Picked.x && In.Ids.z == U.Picked.y) {
        let Stripe = step(0.5, fract((In.Position.x + In.Position.y) / 10.0));
        Lit = mix(Lit, vec3f(1.0, 0.72, 0.22), 0.45 + 0.2 * Stripe);
    }
    let Fog = 1.0 - exp(-U.CameraPosition.w * length(U.CameraPosition.xyz - In.World));
    Lit = mix(Lit, vec3f(0.32, 0.36, 0.42), clamp(Fog, 0.0, 0.85));
    return vec4f(ToneMap(Lit), 1.0);
}
`;

const EnvironmentSource = /* wgsl */ `${SharedDeclarations}
@group(0) @binding(0) var<uniform> U: Uniforms;
struct SkyVaryings { @builtin(position) Position: vec4f, @location(0) Clip: vec2f };
@vertex
fn SkyVertex(@builtin(vertex_index) Index: u32) -> SkyVaryings {
    var Out: SkyVaryings;
    let P = vec2f(f32((Index << 1u) & 2u), f32(Index & 2u));
    Out.Clip = P * 2.0 - 1.0;
    Out.Position = vec4f(Out.Clip, 0.99999, 1.0);
    return Out;
}
@fragment
fn SkyFragment(In: SkyVaryings) -> @location(0) vec4f {
    let Far = U.InverseViewProjection * vec4f(In.Clip, 1.0, 1.0);
    let Near = U.InverseViewProjection * vec4f(In.Clip, 0.0, 1.0);
    let D = normalize(Far.xyz / Far.w - Near.xyz / Near.w);
    let Up = clamp(D.y, -1.0, 1.0);
    let Zenith = vec3f(0.10, 0.16, 0.28); let Horizon = vec3f(0.42, 0.45, 0.50); let Ground = vec3f(0.09, 0.09, 0.10);
    var C = select(mix(Horizon, Ground, pow(max(-Up, 0.0), 0.4)), mix(Horizon, Zenith, pow(max(Up, 0.0), 0.55)), Up > 0.0);
    let Sun = max(dot(D, normalize(U.SunDirection.xyz)), 0.0);
    C += vec3f(1.0, 0.85, 0.6) * (pow(Sun, 900.0) * 6.0 + pow(Sun, 12.0) * 0.18);
    return vec4f(ToneMap(C), 1.0);
}
struct GroundVaryings { @builtin(position) Position: vec4f, @location(0) World: vec3f };
@vertex
fn GroundVertex(@builtin(vertex_index) Index: u32) -> GroundVaryings {
    var Out: GroundVaryings;
    let P = vec2f(f32((Index << 1u) & 2u), f32(Index & 2u)) * 2.0 - 1.0;
    let World = vec3f(U.CameraPosition.x + P.x * 6000.0, U.Params.z, U.CameraPosition.z + P.y * 6000.0);
    Out.World = World;
    Out.Position = U.ViewProjection * vec4f(World, 1.0);
    return Out;
}
fn GridLine(P: vec2f, Spacing: f32) -> f32 {
    let Q = P / Spacing;
    let G = abs(fract(Q - 0.5) - 0.5) / fwidth(Q);
    return 1.0 - min(min(G.x, G.y), 1.0);
}
@fragment
fn GroundFragment(In: GroundVaryings) -> @location(0) vec4f {
    let Minor = GridLine(In.World.xz, 1.0);
    let Major = GridLine(In.World.xz, 10.0);
    let Distance = length(U.CameraPosition.xyz - In.World);
    let Base = vec3f(0.075, 0.078, 0.085) * (0.6 + 0.4 * max(normalize(U.SunDirection.xyz).y, 0.0));
    var C = Base + vec3f(0.05) * Minor * exp(-Distance * 0.02) + vec3f(0.11) * Major * exp(-Distance * 0.004);
    let Fog = 1.0 - exp(-U.CameraPosition.w * Distance);
    C = mix(C, vec3f(0.32, 0.36, 0.42), clamp(Fog, 0.0, 0.9));
    return vec4f(ToneMap(C), 1.0);
}
struct LineVaryings { @builtin(position) Position: vec4f, @location(0) Colour: vec4f };
@vertex
fn LineVertex(@location(0) Position: vec3f, @location(1) Colour: vec4f) -> LineVaryings {
    var Out: LineVaryings;
    Out.Position = U.ViewProjection * vec4f(Position, 1.0);
    Out.Colour = Colour;
    return Out;
}
@fragment
fn LineFragment(In: LineVaryings) -> @location(0) vec4f { return In.Colour; }
@vertex
fn BoxVertex(@location(0) Position: vec3f, @location(1) SphereCenter: vec4f) -> @builtin(position) vec4f {
    return U.ViewProjection * vec4f(SphereCenter.xyz + Position * SphereCenter.w, 1.0);
}
@fragment
fn BoxFragment() -> @location(0) vec4f { return vec4f(0.0); }
`;

export class WebGpuClusterRasterization {
    static Probe() { return typeof navigator !== "undefined" && !!navigator.gpu; }

    static async Create(Canvas) {
        if (!navigator.gpu) throw new Error("WebGPU unavailable in this browser");
        const Adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!Adapter) throw new Error("No WebGPU adapter");
        const Features = [];
        if (Adapter.features.has("timestamp-query")) Features.push("timestamp-query");
        const Device = await Adapter.requestDevice({
            requiredFeatures: Features,
            requiredLimits: {
                maxStorageBufferBindingSize: Adapter.limits.maxStorageBufferBindingSize,
                maxBufferSize: Adapter.limits.maxBufferSize,
            },
        });
        return new WebGpuClusterRasterization(Canvas, Adapter, Device, Features.includes("timestamp-query"));
    }

    constructor(Canvas, Adapter, Device, Timestamps) {
        this.Canvas = Canvas;
        this.Device = Device;
        this.Timestamps = Timestamps;
        const Info = Adapter.info || {};
        this.Adapter = [Info.vendor, Info.architecture, Info.description].filter(Boolean).join(" · ") || "WebGPU adapter";
        this.Label = "WebGPU · compute cull + indirect";
        this.Context = Canvas.getContext("webgpu");
        this.Format = navigator.gpu.getPreferredCanvasFormat();
        this.Context.configure({ device: Device, format: this.Format, alphaMode: "opaque" });
        this.Lost = false;
        Device.lost.then((Reason) => { this.Lost = true; this.LostReason = Reason && Reason.message; console.error(`WebGPU device lost: ${this.LostReason}`); });
        this.ErrorCount = 0;
        Device.addEventListener("uncapturederror", (Event) => { if (this.ErrorCount++ < 8) console.error(`WebGPU: ${Event.error.message}`); });
        this.SampleCount = 4;
        this.Statistics = null;
        this.GpuMilliseconds = null;
        this.Readbacks = [];
        this.ConstructPipelines();
    }

    ConstructPipelines() {
        const D = this.Device;
        this.UniformBuffer = D.createBuffer({ size: UniformBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.IndirectBuffer = D.createBuffer({ size: 16, usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.CounterBuffer = D.createBuffer({ size: CounterCount * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
        this.OcclusionBuffer = D.createBuffer({ size: MaxOcclusionQueries * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_DST });
        this.OcclusionQuerySet = D.createQuerySet({ type: "occlusion", count: MaxOcclusionQueries });
        if (this.Timestamps) {
            this.TimestampQuerySet = D.createQuerySet({ type: "timestamp", count: 2 });
            this.TimestampBuffer = D.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        }
        const CullModule = D.createShaderModule({ code: CullSource, label: "ClusterCullSequence" });
        const RasterModule = D.createShaderModule({ code: RasterSource, label: "ClusterRasterization" });
        const EnvironmentModule = D.createShaderModule({ code: EnvironmentSource, label: "EnvironmentRasterization" });
        this.ShaderModules = [CullModule, RasterModule, EnvironmentModule];
        this.CullPipeline = D.createComputePipeline({ layout: "auto", compute: { module: CullModule, entryPoint: "CullClusters" } });
        const DepthStencil = { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" };
        const Multisample = { count: this.SampleCount };
        const Target = [{ format: this.Format }];
        this.RasterPipeline = D.createRenderPipeline({
            layout: "auto",
            vertex: { module: RasterModule, entryPoint: "VertexMain" },
            fragment: { module: RasterModule, entryPoint: "FragmentMain", targets: Target },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: DepthStencil, multisample: Multisample,
        });
        this.SkyPipeline = D.createRenderPipeline({
            layout: "auto",
            vertex: { module: EnvironmentModule, entryPoint: "SkyVertex" },
            fragment: { module: EnvironmentModule, entryPoint: "SkyFragment", targets: Target },
            depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" }, multisample: Multisample,
        });
        this.GroundPipeline = D.createRenderPipeline({
            layout: "auto",
            vertex: { module: EnvironmentModule, entryPoint: "GroundVertex" },
            fragment: { module: EnvironmentModule, entryPoint: "GroundFragment", targets: Target },
            depthStencil: { ...DepthStencil, depthBias: 2, depthBiasSlopeScale: 1 }, multisample: Multisample,
        });
        this.LinePipeline = D.createRenderPipeline({
            layout: "auto",
            vertex: { module: EnvironmentModule, entryPoint: "LineVertex", buffers: [{ arrayStride: 28, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x4" }] }] },
            fragment: { module: EnvironmentModule, entryPoint: "LineFragment", targets: Target },
            primitive: { topology: "line-list" },
            depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" }, multisample: Multisample,
        });
        this.BoxPipeline = D.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: EnvironmentModule, entryPoint: "BoxVertex",
                buffers: [
                    { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
                    { arrayStride: 16, stepMode: "instance", attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }] },
                ],
            },
            fragment: { module: EnvironmentModule, entryPoint: "BoxFragment", targets: [{ format: this.Format, writeMask: 0 }] },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "less-equal" }, multisample: Multisample,
        });
        const Cube = [];
        const Faces = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
        for (const [A, B, C] of Faces) for (const Sign of [-1, 1]) {
            const P = (U, V) => { const Q = [0, 0, 0]; Q[A] = Sign; Q[B] = U; Q[C] = V; Cube.push(...Q); };
            P(-1, -1); P(1, -1); P(1, 1); P(-1, -1); P(1, 1); P(-1, 1);
        }
        this.CubeVertexCount = Cube.length / 3;
        this.CubeBuffer = D.createBuffer({ size: Cube.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        D.queue.writeBuffer(this.CubeBuffer, 0, new Float32Array(Cube));
        this.EnvironmentBindGroup = (Pipeline) => D.createBindGroup({ layout: Pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.UniformBuffer } }] });
        this.SkyBindGroup = this.EnvironmentBindGroup(this.SkyPipeline);
        this.GroundBindGroup = this.EnvironmentBindGroup(this.GroundPipeline);
        this.LineBindGroup = this.EnvironmentBindGroup(this.LinePipeline);
        this.BoxBindGroup = this.EnvironmentBindGroup(this.BoxPipeline);
    }

    async CompilationReport() {
        const Messages = [];
        for (const Module of this.ShaderModules) {
            const Info = await Module.getCompilationInfo();
            for (const Message of Info.messages) if (Message.type === "error") Messages.push(`${Module.label}: ${Message.message} (line ${Message.lineNum})`);
        }
        return Messages;
    }

    UploadAssets(Assets) {
        const D = this.Device;
        let Words = 0, Clusters = 0, ClusterVertices = 0;
        this.MaxTrianglesPerCluster = 1;
        for (const Asset of Assets) {
            Asset.ClusterVertexBase = ClusterVertices;
            Asset.ClusterBase = Clusters;
            ClusterVertices += Asset.VertexWords.length / VertexWordStride;
            Words += Asset.VertexWords.length;
            Clusters += Asset.ClusterCount;
            this.MaxTrianglesPerCluster = Math.max(this.MaxTrianglesPerCluster, Asset.MaxTrianglesPerCluster);
        }
        if (this.VertexBuffer) this.VertexBuffer.destroy();
        if (this.ClusterBuffer) this.ClusterBuffer.destroy();
        this.VertexBuffer = D.createBuffer({ size: Math.max(16, Words * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.ClusterBuffer = D.createBuffer({ size: Math.max(ClusterRecordBytes, Clusters * ClusterRecordBytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const Records = new ArrayBuffer(Math.max(ClusterRecordBytes, Clusters * ClusterRecordBytes));
        const RecordFloats = new Float32Array(Records), RecordIntegers = new Uint32Array(Records);
        for (const Asset of Assets) {
            D.queue.writeBuffer(this.VertexBuffer, Asset.ClusterVertexBase * VertexWordStride * 4, Asset.VertexWords);
            const F = Asset.ClusterFloats, I = Asset.ClusterIntegers;
            for (let Cluster = 0; Cluster < Asset.ClusterCount; Cluster++) {
                const R = ((Asset.ClusterBase + Cluster) * ClusterRecordBytes) / 4;
                const Src = Cluster * ClusterFloatStride;
                RecordFloats.set(F.subarray(Src, Src + 12), R);          // cull, self, parent spheres
                RecordFloats[R + 12] = F[Src + 12];                        // self error
                RecordFloats[R + 13] = F[Src + 13];                        // parent error
                RecordFloats[R + 14] = F[Src + 17];                        // cone cutoff
                RecordFloats[R + 15] = 0;
                RecordFloats.set(F.subarray(Src + 14, Src + 17), R + 16);  // cone axis
                RecordFloats[R + 19] = 0;
                const Src2 = Cluster * ClusterIntegerStride;
                RecordIntegers[R + 20] = I[Src2] + Asset.ClusterVertexBase;
                RecordIntegers[R + 21] = I[Src2 + 1];
                RecordIntegers[R + 22] = I[Src2 + 2];
                RecordIntegers[R + 23] = I[Src2 + 3] === NoGroup ? NoGroup : I[Src2 + 3] + Asset.ClusterBase;
            }
        }
        D.queue.writeBuffer(this.ClusterBuffer, 0, Records);
        this.ClusterTotal = Clusters;
        this.GpuBytes = Words * 4 + Records.byteLength;
        this.BindGroupsStale = true;
    }

    // Records: [{ Instance, Asset, Index }]
    UploadInstances(Records) {
        const D = this.Device;
        const Count = Records.length;
        const Bytes = Math.max(InstanceRecordBytes, Count * InstanceRecordBytes);
        if (!this.InstanceBuffer || this.InstanceBuffer.size < Bytes) {
            if (this.InstanceBuffer) this.InstanceBuffer.destroy();
            this.InstanceBuffer = D.createBuffer({ size: Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            this.BindGroupsStale = true;
        }
        const Data = new ArrayBuffer(Bytes);
        const Floats = new Float32Array(Data), Integers = new Uint32Array(Data);
        const Spheres = new Float32Array(Math.max(4, Count * 4));
        let MaxClusters = 1, Capacity = 0;
        Records.forEach((Record, Slot) => {
            const Base = (Slot * InstanceRecordBytes) / 4;
            Floats.set(Record.Instance.Model, Base);
            Floats.set(Record.Instance.Inverse, Base + 16);
            Floats.set(Record.Instance.WorldSphere, Base + 32);
            Spheres.set(Record.Instance.WorldSphere, Slot * 4);
            Integers[Base + 36] = Record.Asset.ClusterBase;
            Integers[Base + 37] = Record.Asset.ClusterCount;
            Integers[Base + 38] = Record.Index;
            Integers[Base + 39] = Math.min(Slot, MaxOcclusionQueries - 1);
            Floats.set(Record.Asset.Definition.Albedo, Base + 40);
            Floats[Base + 43] = Record.Asset.Definition.Roughness;
            MaxClusters = Math.max(MaxClusters, Record.Asset.ClusterCount);
            Capacity += Record.Asset.ClusterCount;
        });
        D.queue.writeBuffer(this.InstanceBuffer, 0, Data);
        if (this.SphereBuffer) this.SphereBuffer.destroy();
        this.SphereBuffer = D.createBuffer({ size: Spheres.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        D.queue.writeBuffer(this.SphereBuffer, 0, Spheres);
        // Every instance starts visible for the occlusion test.
        D.queue.writeBuffer(this.OcclusionBuffer, 0, new Uint32Array(MaxOcclusionQueries * 2).fill(1));
        this.InstanceCount = Count;
        this.MaxClustersPerInstance = MaxClusters;
        const VisibleCapacity = Math.max(1024, Math.min(Capacity, 1 << 21));
        if (!this.VisibleBuffer || this.VisibleCapacity !== VisibleCapacity) {
            if (this.VisibleBuffer) this.VisibleBuffer.destroy();
            this.VisibleBuffer = D.createBuffer({ size: VisibleCapacity * 8, usage: GPUBufferUsage.STORAGE });
            this.VisibleCapacity = VisibleCapacity;
            this.BindGroupsStale = true;
        }
    }

    ConstructBindGroups() {
        const D = this.Device;
        this.CullBindGroup = D.createBindGroup({
            layout: this.CullPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.UniformBuffer } },
                { binding: 1, resource: { buffer: this.ClusterBuffer } },
                { binding: 2, resource: { buffer: this.InstanceBuffer } },
                { binding: 3, resource: { buffer: this.VisibleBuffer } },
                { binding: 4, resource: { buffer: this.IndirectBuffer } },
                { binding: 5, resource: { buffer: this.CounterBuffer } },
                { binding: 6, resource: { buffer: this.OcclusionBuffer } },
            ],
        });
        this.RasterBindGroup = D.createBindGroup({
            layout: this.RasterPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.UniformBuffer } },
                { binding: 1, resource: { buffer: this.ClusterBuffer } },
                { binding: 2, resource: { buffer: this.InstanceBuffer } },
                { binding: 3, resource: { buffer: this.VisibleBuffer } },
                { binding: 4, resource: { buffer: this.VertexBuffer } },
            ],
        });
        this.BindGroupsStale = false;
    }

    Resize(Width, Height) {
        if (this.Canvas.width !== Width || this.Canvas.height !== Height || !this.ColourTarget) {
            this.Canvas.width = Width;
            this.Canvas.height = Height;
            if (this.ColourTarget) this.ColourTarget.destroy();
            if (this.DepthTarget) this.DepthTarget.destroy();
            this.ColourTarget = this.Device.createTexture({ size: [Width, Height], sampleCount: this.SampleCount, format: this.Format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
            this.DepthTarget = this.Device.createTexture({ size: [Width, Height], sampleCount: this.SampleCount, format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
            if (this.CaptureTexture) this.EnableCapture(true);
        }
    }

    // Frame: { ViewProjection (z 0..1), CullView, CameraPosition, SunDirection, SunColour, Settings, Picked, Lines, GroundHeight }
    RenderFrame(Frame) {
        if (this.Lost || !this.ClusterBuffer || !this.InstanceBuffer || !this.InstanceCount) return;
        if (this.BindGroupsStale) this.ConstructBindGroups();
        const D = this.Device;
        const Settings = Frame.Settings;
        const Uniform = new ArrayBuffer(UniformBytes);
        const F = new Float32Array(Uniform), I = new Uint32Array(Uniform);
        F.set(Frame.ViewProjection, 0);
        F.set(Frame.CullView.Planes, 16);
        F.set([Frame.CullView.Eye[0], Frame.CullView.Eye[1], Frame.CullView.Eye[2], Frame.CullView.Scale], 40);
        F.set([Frame.CameraPosition[0], Frame.CameraPosition[1], Frame.CameraPosition[2], Settings.FogDensity], 44);
        F.set([Frame.SunDirection[0], Frame.SunDirection[1], Frame.SunDirection[2], 0], 48);
        F.set([Frame.SunColour[0], Frame.SunColour[1], Frame.SunColour[2], 0], 52);
        F.set([Settings.Threshold, Frame.CullView.Near, Frame.GroundHeight ?? 0, 0], 56);
        const Occlusion = Settings.EnableOcclusion && !Settings.FreezeCut && this.InstanceCount <= MaxOcclusionQueries;
        I[60] = (Settings.EnableFrustum ? 1 : 0) | (Settings.EnableCone ? 2 : 0) | (Occlusion ? 4 : 0) | (Settings.ForcedLevel >= 0 ? 8 : 0);
        I[61] = Math.max(0, Settings.ForcedLevel);
        I[62] = Settings.DebugView;
        I[63] = Settings.Wireframe ? 1 : 0;
        I[64] = Frame.Picked ? Frame.Picked.GlobalCluster + 1 : 0;
        I[65] = Frame.Picked ? Frame.Picked.Instance : 0;
        I[66] = this.VisibleCapacity;
        I[67] = this.InstanceCount;
        F.set(InvertTransform(Frame.ViewProjection), 68);
        D.queue.writeBuffer(this.UniformBuffer, 0, Uniform);
        D.queue.writeBuffer(this.IndirectBuffer, 0, new Uint32Array([this.MaxTrianglesPerCluster * 3, 0, 0, 0]));
        D.queue.writeBuffer(this.CounterBuffer, 0, new Uint32Array(CounterCount));

        let LineBuffer = null, LineVertexCount = 0;
        if (Frame.Lines && Frame.Lines.length) {
            const Total = Frame.Lines.reduce((Sum, Batch) => Sum + Batch.Positions.length / 3, 0);
            const Interleaved = new Float32Array(Total * 7);
            let Cursor = 0;
            for (const Batch of Frame.Lines) {
                for (let Index = 0; Index < Batch.Positions.length; Index += 3) {
                    Interleaved.set(Batch.Positions.subarray(Index, Index + 3), Cursor);
                    Interleaved.set(Batch.Colour, Cursor + 3);
                    Cursor += 7;
                }
            }
            LineBuffer = D.createBuffer({ size: Interleaved.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            D.queue.writeBuffer(LineBuffer, 0, Interleaved);
            LineVertexCount = Total;
        }

        const Encoder = D.createCommandEncoder();
        const ComputeDescriptor = {};
        if (this.Timestamps) ComputeDescriptor.timestampWrites = { querySet: this.TimestampQuerySet, beginningOfPassWriteIndex: 0 };
        const Compute = Encoder.beginComputePass(ComputeDescriptor);
        Compute.setPipeline(this.CullPipeline);
        Compute.setBindGroup(0, this.CullBindGroup);
        Compute.dispatchWorkgroups(Math.ceil(this.MaxClustersPerInstance / 64), this.InstanceCount);
        Compute.end();

        const RenderDescriptor = {
            colorAttachments: [{ view: this.ColourTarget.createView(), resolveTarget: (this.CaptureTexture || this.Context.getCurrentTexture()).createView(), loadOp: "clear", storeOp: "discard", clearValue: { r: 0.05, g: 0.05, b: 0.06, a: 1 } }],
            depthStencilAttachment: { view: this.DepthTarget.createView(), depthLoadOp: "clear", depthStoreOp: "discard", depthClearValue: 1 },
        };
        if (Occlusion) RenderDescriptor.occlusionQuerySet = this.OcclusionQuerySet;
        if (this.Timestamps) RenderDescriptor.timestampWrites = { querySet: this.TimestampQuerySet, endOfPassWriteIndex: 1 };
        const Pass = Encoder.beginRenderPass(RenderDescriptor);
        Pass.setPipeline(this.SkyPipeline);
        Pass.setBindGroup(0, this.SkyBindGroup);
        Pass.draw(3);
        Pass.setPipeline(this.RasterPipeline);
        Pass.setBindGroup(0, this.RasterBindGroup);
        Pass.drawIndirect(this.IndirectBuffer, 0);
        if (Settings.GroundGrid) {
            Pass.setPipeline(this.GroundPipeline);
            Pass.setBindGroup(0, this.GroundBindGroup);
            Pass.draw(3);
        }
        if (Occlusion) {
            Pass.setPipeline(this.BoxPipeline);
            Pass.setBindGroup(0, this.BoxBindGroup);
            Pass.setVertexBuffer(0, this.CubeBuffer);
            Pass.setVertexBuffer(1, this.SphereBuffer);
            for (let Slot = 0; Slot < this.InstanceCount; Slot++) {
                Pass.beginOcclusionQuery(Slot);
                Pass.draw(this.CubeVertexCount, 1, 0, Slot);
                Pass.endOcclusionQuery();
            }
        }
        if (LineBuffer) {
            Pass.setPipeline(this.LinePipeline);
            Pass.setBindGroup(0, this.LineBindGroup);
            Pass.setVertexBuffer(0, LineBuffer);
            Pass.draw(LineVertexCount);
        }
        Pass.end();
        if (Occlusion) Encoder.resolveQuerySet(this.OcclusionQuerySet, 0, this.InstanceCount, this.OcclusionBuffer, 0);

        let Readback = this.Readbacks.find((Entry) => !Entry.Pending);
        if (!Readback && this.Readbacks.length < 3) {
            Readback = { Buffer: D.createBuffer({ size: CounterCount * 4 + 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), Pending: false };
            this.Readbacks.push(Readback);
        }
        if (Readback) {
            Encoder.copyBufferToBuffer(this.CounterBuffer, 0, Readback.Buffer, 0, CounterCount * 4);
            if (this.Timestamps) {
                Encoder.resolveQuerySet(this.TimestampQuerySet, 0, 2, this.TimestampBuffer, 0);
                Encoder.copyBufferToBuffer(this.TimestampBuffer, 0, Readback.Buffer, CounterCount * 4, 16);
            }
        }
        D.queue.submit([Encoder.finish()]);
        if (LineBuffer) LineBuffer.destroy();
        if (Readback) {
            Readback.Pending = true;
            Readback.Buffer.mapAsync(GPUMapMode.READ).then(() => {
                const Words = new Uint32Array(Readback.Buffer.getMappedRange().slice(0));
                Readback.Buffer.unmap();
                Readback.Pending = false;
                this.Statistics = {
                    ClustersDrawn: Words[0], TrianglesDrawn: Words[1], InstancesCulledFrustum: Words[2], InstancesOccluded: Words[3],
                    InstancesDrawn: Words[4], ClustersRejectedLevel: Words[5], ClustersCulledFrustum: Words[6], ClustersCulledCone: Words[7],
                    LevelClusters: Words.slice(16, 48), Overflow: Words[0] > this.VisibleCapacity,
                };
                if (this.Timestamps) {
                    const Times = new BigUint64Array(Words.buffer, CounterCount * 4, 2);
                    const Nanoseconds = Number(Times[1] - Times[0]);
                    if (Nanoseconds > 0 && Nanoseconds < 1e9) this.GpuMilliseconds = this.GpuMilliseconds == null ? Nanoseconds / 1e6 : this.GpuMilliseconds * 0.85 + (Nanoseconds / 1e6) * 0.15;
                }
            }).catch(() => { Readback.Pending = false; });
        }
    }

    QueryGpuMilliseconds() { return this.GpuMilliseconds; }

    // Offscreen capture: subsequent frames resolve into a copyable texture instead of the
    // canvas (stills, and headless environments whose canvas presentation is unavailable).
    EnableCapture(Enabled = true) {
        if (this.CaptureTexture) { this.CaptureTexture.destroy(); this.CaptureTexture = null; }
        if (Enabled) this.CaptureTexture = this.Device.createTexture({ size: [this.Canvas.width, this.Canvas.height], format: this.Format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    }

    // Reads the capture texture back as ImageData (RGBA, swizzled if the format is BGRA).
    async CaptureImage() {
        const Texture = this.CaptureTexture;
        if (!Texture) return null;
        const Width = Texture.width, Height = Texture.height;
        const Row = Math.ceil((Width * 4) / 256) * 256;
        const Buffer = this.Device.createBuffer({ size: Row * Height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const Encoder = this.Device.createCommandEncoder();
        Encoder.copyTextureToBuffer({ texture: Texture }, { buffer: Buffer, bytesPerRow: Row }, [Width, Height]);
        this.Device.queue.submit([Encoder.finish()]);
        await Buffer.mapAsync(GPUMapMode.READ);
        const Source = new Uint8Array(Buffer.getMappedRange());
        const Pixels = new Uint8ClampedArray(Width * Height * 4);
        const Swizzle = this.Format.startsWith("bgra");
        for (let Y = 0; Y < Height; Y++) {
            for (let X = 0; X < Width; X++) {
                const S = Y * Row + X * 4, D = (Y * Width + X) * 4;
                Pixels[D] = Source[S + (Swizzle ? 2 : 0)]; Pixels[D + 1] = Source[S + 1]; Pixels[D + 2] = Source[S + (Swizzle ? 0 : 2)]; Pixels[D + 3] = 255;
            }
        }
        Buffer.unmap();
        Buffer.destroy();
        return new ImageData(Pixels, Width, Height);
    }
}
