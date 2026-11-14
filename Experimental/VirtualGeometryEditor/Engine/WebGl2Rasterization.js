// WebGL2 rasterization path: CPU-selected cluster ranges drawn with WEBGL_multi_draw,
// discrete LOD levels with dithered cross-fade, procedural sky + ground grid, debug line
// overlays, per-instance occlusion queries, and GPU timer queries.

import { InvertTransform } from "./LinearAlgebra.js";
import { VertexWordStride, ClusterFloatStride, ClusterIntegerStride, NoGroup } from "./ClusterHierarchyBuilder.js";

export const DebugViews = ["Lit", "Clusters", "Groups", "Level", "Triangles", "Error", "Instances", "Normals"];

const ShadingFunctions = /* glsl */ `
uint HashScalar(uint X) {
    X ^= X >> 16u; X *= 0x7feb352du; X ^= X >> 15u; X *= 0x846ca68bu; X ^= X >> 16u;
    return X;
}
vec3 HashColour(uint Seed) {
    uint H = HashScalar(Seed);
    vec3 C = vec3(float(H & 255u), float((H >> 8u) & 255u), float((H >> 16u) & 255u)) / 255.0;
    return mix(vec3(0.18), C, 0.85);
}
vec3 LevelColour(float Level) {
    vec3 Stops[12] = vec3[12](vec3(0.20,0.45,1.00), vec3(0.10,0.72,0.95), vec3(0.10,0.85,0.70), vec3(0.25,0.85,0.35), vec3(0.60,0.88,0.20), vec3(0.92,0.88,0.18), vec3(1.00,0.70,0.15), vec3(1.00,0.50,0.12), vec3(0.95,0.28,0.22), vec3(0.88,0.22,0.48), vec3(0.72,0.25,0.80), vec3(0.92,0.88,0.96));
    return Stops[clamp(int(Level), 0, 11)];
}
vec3 HeatColour(float T) {
    T = clamp(T, 0.0, 1.5);
    vec3 Cool = vec3(0.10, 0.20, 0.60), Mid = vec3(0.15, 0.75, 0.55), Warm = vec3(1.0, 0.82, 0.25), Hot = vec3(1.0, 0.2, 0.15);
    return T < 0.5 ? mix(Cool, Mid, T * 2.0) : T < 1.0 ? mix(Mid, Warm, (T - 0.5) * 2.0) : mix(Warm, Hot, (T - 1.0) * 2.0);
}
vec3 ToneMap(vec3 C) {
    C = (C * (2.51 * C + 0.03)) / (C * (2.43 * C + 0.59) + 0.14);
    return pow(clamp(C, 0.0, 1.0), vec3(1.0 / 2.2));
}
float BayerThreshold(vec2 P) {
    ivec2 I = ivec2(mod(P, 4.0));
    int M[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(M[I.y * 4 + I.x]) + 0.5) / 16.0;
}
`;

const GeometryVertexSource = /* glsl */ `#version 300 es
precision highp float; precision highp int;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aNormal;
layout(location = 2) in uint aCluster;
layout(location = 3) in uint aPacked;
uniform mat4 uViewProjection;
uniform mat4 uModel;
uniform uint uClusterBase;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vBarycentric;
out vec3 vLocal;
flat out uint vCluster;
flat out uint vPacked;
vec3 OctDecode(vec2 E) {
    vec3 N = vec3(E, 1.0 - abs(E.x) - abs(E.y));
    float T = max(-N.z, 0.0);
    N.x += N.x >= 0.0 ? -T : T;
    N.y += N.y >= 0.0 ? -T : T;
    return normalize(N);
}
void main() {
    vec4 World = uModel * vec4(aPosition, 1.0);
    vWorld = World.xyz;
    vLocal = aPosition;
    vNormal = mat3(uModel) * OctDecode(aNormal);
    bool Discrete = (aPacked & 0x10000u) != 0u;
    vCluster = Discrete ? aCluster : aCluster + uClusterBase;
    vPacked = aPacked;
    uint Corner = (aPacked >> 8u) & 3u;
    vBarycentric = Corner == 0u ? vec3(1, 0, 0) : Corner == 1u ? vec3(0, 1, 0) : vec3(0, 0, 1);
    gl_Position = uViewProjection * World;
}`;

const GeometryFragmentSource = /* glsl */ `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vBarycentric;
in vec3 vLocal;
flat in uint vCluster;
flat in uint vPacked;
uniform int uDebugView;
uniform int uWireframe;
uniform vec3 uSunDirection;
uniform vec3 uSunColour;
uniform vec3 uCameraPosition;
uniform vec3 uAlbedo;
uniform float uRoughness;
uniform sampler2D uClusterTexture;
uniform int uClusterTextureWidth;
uniform vec3 uLocalEye;
uniform float uProjectionScale;
uniform float uThreshold;
uniform uint uInstance;
uniform uvec2 uPicked;
uniform float uFade;
uniform int uFadeInvert;
uniform float uFogDensity;
out vec4 Colour;
${ShadingFunctions}
vec4 ClusterTexel(uint Cluster, int Slot) {
    int Index = int(Cluster) * 2 + Slot;
    return texelFetch(uClusterTexture, ivec2(Index % uClusterTextureWidth, Index / uClusterTextureWidth), 0);
}
void main() {
    if (uFade < 1.0) {
        float B = BayerThreshold(gl_FragCoord.xy);
        if (uFadeInvert == 0 ? B > uFade : B <= uFade) discard;
    }
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCameraPosition - vWorld);
    vec3 L = normalize(uSunDirection);
    float Lambert = max(dot(N, L), 0.0);
    bool Discrete = (vPacked & 0x10000u) != 0u;
    float Level = float((vPacked >> 10u) & 63u);
    uint Triangle = vPacked & 255u;

    vec3 Base = uAlbedo;
    bool DebugTint = uDebugView != 0;
    if (uDebugView == 1) Base = Discrete ? LevelColour(Level) : HashColour(vCluster * 7919u + 13u);
    else if (uDebugView == 2) {
        if (Discrete) Base = LevelColour(Level);
        else {
            float Group = ClusterTexel(vCluster, 1).z;
            Base = Group < 0.0 ? HashColour(vCluster) * 0.6 : HashColour(uint(Group) * 104729u + 7u);
        }
    }
    else if (uDebugView == 3) Base = LevelColour(Level);
    else if (uDebugView == 4) Base = HashColour((Discrete ? vCluster : vCluster * 256u + Triangle) * 2654435761u + 1u);
    else if (uDebugView == 5) {
        if (Discrete) Base = LevelColour(Level);
        else {
            vec4 Self = ClusterTexel(vCluster, 0);
            float Error = ClusterTexel(vCluster, 1).x;
            float Distance = max(length(Self.xyz - uLocalEye) - Self.w, 1e-4);
            Base = HeatColour((Error * uProjectionScale / Distance) / max(uThreshold, 1e-6));
        }
    }
    else if (uDebugView == 6) Base = HashColour(uInstance * 31337u + 3u);
    else if (uDebugView == 7) Base = N * 0.5 + 0.5;

    vec3 Lit;
    if (uDebugView == 7) Lit = Base * Base;
    else if (DebugTint) {
        Lit = Base * Base * (0.30 + 0.85 * Lambert) + Base * Base * 0.15 * (N.y * 0.5 + 0.5);
    } else {
        vec3 H = normalize(L + V);
        float Shine = mix(8.0, 96.0, 1.0 - uRoughness);
        float Specular = pow(max(dot(N, H), 0.0), Shine) * (Shine + 8.0) / 25.0 * (1.0 - uRoughness) * 0.35;
        float Fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0) * 0.18;
        vec3 Sky = mix(vec3(0.20, 0.18, 0.16), vec3(0.42, 0.52, 0.68), N.y * 0.5 + 0.5);
        Lit = uAlbedo * (Sky * 0.42 + uSunColour * Lambert) + uSunColour * Specular * Lambert + Sky * Fresnel;
    }
    if (uWireframe != 0) {
        vec3 Width = fwidth(vBarycentric);
        vec3 Edge = smoothstep(vec3(0.0), Width * 1.1, vBarycentric);
        float Line = 1.0 - min(min(Edge.x, Edge.y), Edge.z);
        Lit = mix(Lit, DebugTint ? Lit * 0.25 : vec3(0.02, 0.025, 0.03), Line * 0.85);
    }
    if (uPicked.x != 0u && vCluster + 1u == uPicked.x && uInstance == uPicked.y && !Discrete) {
        float Stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 10.0));
        Lit = mix(Lit, vec3(1.0, 0.72, 0.22), 0.45 + 0.2 * Stripe);
    }
    float Fog = 1.0 - exp(-uFogDensity * length(uCameraPosition - vWorld));
    Lit = mix(Lit, vec3(0.32, 0.36, 0.42), clamp(Fog, 0.0, 0.85));
    Colour = vec4(ToneMap(Lit), 1.0);
}`;

const SkyVertexSource = /* glsl */ `#version 300 es
precision highp float;
out vec2 vClip;
void main() {
    vec2 P = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vClip = P * 2.0 - 1.0;
    gl_Position = vec4(vClip, 0.9999, 1.0);
}`;

const SkyFragmentSource = /* glsl */ `#version 300 es
precision highp float;
in vec2 vClip;
uniform mat4 uInverseViewProjection;
uniform vec3 uSunDirection;
out vec4 Colour;
${ShadingFunctions}
void main() {
    vec4 Far = uInverseViewProjection * vec4(vClip, 1.0, 1.0);
    vec4 Near = uInverseViewProjection * vec4(vClip, -1.0, 1.0);
    vec3 D = normalize(Far.xyz / Far.w - Near.xyz / Near.w);
    float Up = clamp(D.y, -1.0, 1.0);
    vec3 Zenith = vec3(0.10, 0.16, 0.28), Horizon = vec3(0.42, 0.45, 0.50), Ground = vec3(0.09, 0.09, 0.10);
    vec3 C = Up > 0.0 ? mix(Horizon, Zenith, pow(Up, 0.55)) : mix(Horizon, Ground, pow(-Up, 0.4));
    float Sun = max(dot(D, normalize(uSunDirection)), 0.0);
    C += vec3(1.0, 0.85, 0.6) * (pow(Sun, 900.0) * 6.0 + pow(Sun, 12.0) * 0.18);
    Colour = vec4(ToneMap(C), 1.0);
}`;

const GroundVertexSource = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 uViewProjection;
uniform float uGroundHeight;
uniform vec3 uCameraPosition;
out vec3 vWorld;
void main() {
    vec2 P = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    // Large triangle following the camera so the grid never runs out.
    vec3 World = vec3(uCameraPosition.x + P.x * 6000.0, uGroundHeight, uCameraPosition.z + P.y * 6000.0);
    vWorld = World;
    gl_Position = uViewProjection * vec4(World, 1.0);
}`;

const GroundFragmentSource = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform float uFogDensity;
out vec4 Colour;
${ShadingFunctions}
float GridLine(vec2 P, float Spacing) {
    vec2 G = abs(fract(P / Spacing - 0.5) - 0.5) / fwidth(P / Spacing);
    return 1.0 - min(min(G.x, G.y), 1.0);
}
void main() {
    vec2 P = vWorld.xz;
    float Minor = GridLine(P, 1.0), Major = GridLine(P, 10.0);
    float Distance = length(uCameraPosition - vWorld);
    vec3 Base = vec3(0.075, 0.078, 0.085) * (0.6 + 0.4 * max(normalize(uSunDirection).y, 0.0));
    vec3 C = Base + vec3(0.05) * Minor * exp(-Distance * 0.02) + vec3(0.11) * Major * exp(-Distance * 0.004);
    float Fog = 1.0 - exp(-uFogDensity * Distance);
    C = mix(C, vec3(0.32, 0.36, 0.42), clamp(Fog, 0.0, 0.9));
    Colour = vec4(ToneMap(C), 1.0);
}`;

const LineVertexSource = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProjection;
uniform mat4 uModel;
void main() { gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0); }`;

const LineFragmentSource = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uColour;
out vec4 Colour;
void main() { Colour = uColour; }`;

function CompileProgram(GL, VertexSource, FragmentSource, Label) {
    const Compile = (Category, Source) => {
        const Shader = GL.createShader(Category);
        GL.shaderSource(Shader, Source);
        GL.compileShader(Shader);
        if (!GL.getShaderParameter(Shader, GL.COMPILE_STATUS)) throw new Error(`${Label} shader: ${GL.getShaderInfoLog(Shader)}`);
        return Shader;
    };
    const Program = GL.createProgram();
    GL.attachShader(Program, Compile(GL.VERTEX_SHADER, VertexSource));
    GL.attachShader(Program, Compile(GL.FRAGMENT_SHADER, FragmentSource));
    GL.linkProgram(Program);
    if (!GL.getProgramParameter(Program, GL.LINK_STATUS)) throw new Error(`${Label} link: ${GL.getProgramInfoLog(Program)}`);
    const Uniforms = {};
    const Count = GL.getProgramParameter(Program, GL.ACTIVE_UNIFORMS);
    for (let Index = 0; Index < Count; Index++) {
        const Name = GL.getActiveUniform(Program, Index).name.replace(/\[0\]$/, "");
        Uniforms[Name] = GL.getUniformLocation(Program, Name);
    }
    return { Program, Uniforms };
}

const IdentityModel = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class WebGl2Rasterization {
    static Probe() {
        try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
    }

    constructor(Canvas) {
        this.Canvas = Canvas;
        const GL = Canvas.getContext("webgl2", { antialias: true, alpha: false, depth: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
        if (!GL) throw new Error("WebGL2 unavailable");
        this.GL = GL;
        this.MultiDraw = GL.getExtension("WEBGL_multi_draw");
        this.TimerExtension = GL.getExtension("EXT_disjoint_timer_query_webgl2");
        this.Label = `WebGL2${this.MultiDraw ? " · multi-draw" : ""}`;
        const Debug = GL.getExtension("WEBGL_debug_renderer_info");
        this.Adapter = Debug ? GL.getParameter(Debug.UNMASKED_RENDERER_WEBGL) : GL.getParameter(GL.RENDERER);
        this.Geometry = CompileProgram(GL, GeometryVertexSource, GeometryFragmentSource, "Geometry");
        this.Sky = CompileProgram(GL, SkyVertexSource, SkyFragmentSource, "Sky");
        this.Ground = CompileProgram(GL, GroundVertexSource, GroundFragmentSource, "Ground");
        this.Lines = CompileProgram(GL, LineVertexSource, LineFragmentSource, "Lines");
        this.EmptyVertexArray = GL.createVertexArray();
        this.LineBuffer = GL.createBuffer();
        this.LineVertexArray = GL.createVertexArray();
        GL.bindVertexArray(this.LineVertexArray);
        GL.bindBuffer(GL.ARRAY_BUFFER, this.LineBuffer);
        GL.enableVertexAttribArray(0);
        GL.vertexAttribPointer(0, 3, GL.FLOAT, false, 12, 0);
        // Unit cube (−1..1) triangles for occlusion queries.
        const Cube = [];
        const Corner = (X, Y, Z) => Cube.push(X, Y, Z);
        const Faces = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]];
        for (const [A, B, C] of Faces) {
            for (const Sign of [-1, 1]) {
                const P = (U, V) => { const Q = [0, 0, 0]; Q[A] = Sign; Q[B] = U; Q[C] = V; Corner(...Q); };
                P(-1, -1); P(1, -1); P(1, 1); P(-1, -1); P(1, 1); P(-1, 1);
            }
        }
        this.CubeVertexCount = Cube.length / 3;
        this.CubeBuffer = GL.createBuffer();
        this.CubeVertexArray = GL.createVertexArray();
        GL.bindVertexArray(this.CubeVertexArray);
        GL.bindBuffer(GL.ARRAY_BUFFER, this.CubeBuffer);
        GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(Cube), GL.STATIC_DRAW);
        GL.enableVertexAttribArray(0);
        GL.vertexAttribPointer(0, 3, GL.FLOAT, false, 12, 0);
        GL.bindVertexArray(null);
        this.Queries = new Map();
        this.TimerQueries = [];
        this.GpuMilliseconds = 0;
        this.Assets = [];
        this.ContextLost = false;
        Canvas.addEventListener("webglcontextlost", (Event) => { Event.preventDefault(); this.ContextLost = true; });
    }

    // Uploads every asset's cluster + discrete vertex words into two shared buffers and the
    // per-cluster LOD records into one RGBA32F texture.
    UploadAssets(Assets) {
        const GL = this.GL;
        this.ReleaseAssets();
        let ClusterVertices = 0, DiscreteVertices = 0, Clusters = 0;
        for (const Asset of Assets) {
            Asset.ClusterVertexBase = ClusterVertices;
            Asset.DiscreteVertexBase = DiscreteVertices;
            Asset.ClusterBase = Clusters;
            ClusterVertices += Asset.VertexWords.length / VertexWordStride;
            DiscreteVertices += Asset.DiscreteWords.length / VertexWordStride;
            Clusters += Asset.ClusterCount;
        }
        const Construct = (Total, Key, BaseKey) => {
            const Buffer = GL.createBuffer();
            GL.bindBuffer(GL.ARRAY_BUFFER, Buffer);
            GL.bufferData(GL.ARRAY_BUFFER, Math.max(4, Total * VertexWordStride * 4), GL.STATIC_DRAW);
            for (const Asset of Assets) GL.bufferSubData(GL.ARRAY_BUFFER, Asset[BaseKey] * VertexWordStride * 4, Asset[Key]);
            const VertexArray = GL.createVertexArray();
            GL.bindVertexArray(VertexArray);
            GL.enableVertexAttribArray(0);
            GL.vertexAttribPointer(0, 3, GL.FLOAT, false, 24, 0);
            GL.enableVertexAttribArray(1);
            GL.vertexAttribPointer(1, 2, GL.SHORT, true, 24, 12);
            GL.enableVertexAttribArray(2);
            GL.vertexAttribIPointer(2, 1, GL.UNSIGNED_INT, 24, 16);
            GL.enableVertexAttribArray(3);
            GL.vertexAttribIPointer(3, 1, GL.UNSIGNED_INT, 24, 20);
            GL.bindVertexArray(null);
            return { Buffer, VertexArray };
        };
        this.ClusterGeometry = Construct(ClusterVertices, "VertexWords", "ClusterVertexBase");
        this.DiscreteGeometry = Construct(DiscreteVertices, "DiscreteWords", "DiscreteVertexBase");
        const Width = 2048;
        const Height = Math.max(1, Math.ceil((Clusters * 2) / Width));
        const Texels = new Float32Array(Width * Height * 4);
        for (const Asset of Assets) {
            for (let Cluster = 0; Cluster < Asset.ClusterCount; Cluster++) {
                const F = Cluster * ClusterFloatStride, T = (Asset.ClusterBase + Cluster) * 8;
                Texels.set(Asset.ClusterFloats.subarray(F + 4, F + 8), T);
                Texels[T + 4] = Asset.ClusterFloats[F + 12];
                Texels[T + 5] = Asset.ClusterFloats[F + 13];
                const Group = Asset.ClusterIntegers[Cluster * ClusterIntegerStride + 3];
                Texels[T + 6] = Group === NoGroup ? -1 : Group + Asset.ClusterBase;
                Texels[T + 7] = Asset.ClusterIntegers[Cluster * ClusterIntegerStride + 2];
            }
        }
        this.ClusterTexture = GL.createTexture();
        GL.bindTexture(GL.TEXTURE_2D, this.ClusterTexture);
        GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA32F, Width, Height, 0, GL.RGBA, GL.FLOAT, Texels);
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
        this.ClusterTextureWidth = Width;
        this.Assets = Assets;
        this.GpuBytes = (ClusterVertices + DiscreteVertices) * VertexWordStride * 4 + Texels.byteLength;
    }

    ReleaseAssets() {
        const GL = this.GL;
        for (const Geometry of [this.ClusterGeometry, this.DiscreteGeometry]) {
            if (!Geometry) continue;
            GL.deleteBuffer(Geometry.Buffer);
            GL.deleteVertexArray(Geometry.VertexArray);
        }
        if (this.ClusterTexture) GL.deleteTexture(this.ClusterTexture);
        this.ClusterGeometry = this.DiscreteGeometry = this.ClusterTexture = null;
    }

    Resize(Width, Height) {
        if (this.Canvas.width !== Width || this.Canvas.height !== Height) {
            this.Canvas.width = Width;
            this.Canvas.height = Height;
        }
    }

    // Frame: { ViewProjection, CameraPosition, SunDirection, Settings, Views: [{ Scissor, Draws }], Lines, OcclusionTests }
    RenderFrame(Frame) {
        const GL = this.GL;
        if (this.ContextLost || !this.ClusterGeometry) return;
        this.CollectTimer();
        let Timer = null;
        if (this.TimerExtension && this.TimerQueries.length < 4) {
            Timer = GL.createQuery();
            GL.beginQuery(this.TimerExtension.TIME_ELAPSED_EXT, Timer);
        }
        const Width = this.Canvas.width, Height = this.Canvas.height;
        GL.viewport(0, 0, Width, Height);
        GL.disable(GL.SCISSOR_TEST);
        GL.clearColor(0.05, 0.05, 0.06, 1);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        const Settings = Frame.Settings;
        const InverseViewProjection = InvertTransform(Frame.ViewProjection);

        for (const View of Frame.Views) {
            if (View.Scissor) {
                GL.enable(GL.SCISSOR_TEST);
                GL.scissor(View.Scissor[0], View.Scissor[1], View.Scissor[2], View.Scissor[3]);
            } else GL.disable(GL.SCISSOR_TEST);

            // Sky.
            GL.disable(GL.DEPTH_TEST);
            GL.depthMask(false);
            GL.useProgram(this.Sky.Program);
            GL.uniformMatrix4fv(this.Sky.Uniforms.uInverseViewProjection, false, InverseViewProjection);
            GL.uniform3fv(this.Sky.Uniforms.uSunDirection, Frame.SunDirection);
            GL.bindVertexArray(this.EmptyVertexArray);
            GL.drawArrays(GL.TRIANGLES, 0, 3);
            GL.enable(GL.DEPTH_TEST);
            GL.depthMask(true);
            GL.depthFunc(GL.LEQUAL);

            // Geometry.
            const P = this.Geometry;
            GL.useProgram(P.Program);
            GL.uniformMatrix4fv(P.Uniforms.uViewProjection, false, Frame.ViewProjection);
            GL.uniform3fv(P.Uniforms.uSunDirection, Frame.SunDirection);
            GL.uniform3fv(P.Uniforms.uSunColour, Frame.SunColour);
            GL.uniform3fv(P.Uniforms.uCameraPosition, Frame.CameraPosition);
            GL.uniform1i(P.Uniforms.uDebugView, View.DebugView ?? Settings.DebugView);
            GL.uniform1i(P.Uniforms.uWireframe, Settings.Wireframe ? 1 : 0);
            GL.uniform1f(P.Uniforms.uProjectionScale, Frame.ProjectionScale);
            GL.uniform1f(P.Uniforms.uThreshold, Settings.Threshold);
            GL.uniform1f(P.Uniforms.uFogDensity, Settings.FogDensity);
            GL.uniform1i(P.Uniforms.uClusterTextureWidth, this.ClusterTextureWidth);
            GL.uniform2ui(P.Uniforms.uPicked, Frame.Picked ? Frame.Picked.GlobalCluster + 1 : 0, Frame.Picked ? Frame.Picked.Instance : 0);
            GL.activeTexture(GL.TEXTURE0);
            GL.bindTexture(GL.TEXTURE_2D, this.ClusterTexture);
            GL.uniform1i(P.Uniforms.uClusterTexture, 0);
            let BoundGeometry = null;
            for (const Draw of View.Draws) {
                const Geometry = Draw.Discrete ? this.DiscreteGeometry : this.ClusterGeometry;
                if (Geometry !== BoundGeometry) { GL.bindVertexArray(Geometry.VertexArray); BoundGeometry = Geometry; }
                GL.uniformMatrix4fv(P.Uniforms.uModel, false, Draw.Model);
                GL.uniform1ui(P.Uniforms.uClusterBase, Draw.Asset.ClusterBase);
                GL.uniform1ui(P.Uniforms.uInstance, Draw.Instance);
                GL.uniform3fv(P.Uniforms.uAlbedo, Draw.Albedo);
                GL.uniform1f(P.Uniforms.uRoughness, Draw.Roughness);
                GL.uniform3fv(P.Uniforms.uLocalEye, Draw.LocalEye);
                GL.uniform1f(P.Uniforms.uFade, Draw.Fade ?? 1);
                GL.uniform1i(P.Uniforms.uFadeInvert, Draw.FadeInvert ? 1 : 0);
                const Base = Draw.Discrete ? Draw.Asset.DiscreteVertexBase : Draw.Asset.ClusterVertexBase;
                const Firsts = Draw.Firsts, Counts = Draw.Counts, RangeCount = Draw.RangeCount;
                if (Base !== 0) for (let Index = 0; Index < RangeCount; Index++) Firsts[Index] += Base;
                if (this.MultiDraw && RangeCount > 1) {
                    this.MultiDraw.multiDrawArraysWEBGL(GL.TRIANGLES, Firsts, 0, Counts, 0, RangeCount);
                } else {
                    for (let Index = 0; Index < RangeCount; Index++) GL.drawArrays(GL.TRIANGLES, Firsts[Index], Counts[Index]);
                }
                if (Base !== 0) for (let Index = 0; Index < RangeCount; Index++) Firsts[Index] -= Base;
            }

            if (Settings.GroundGrid) {
                GL.useProgram(this.Ground.Program);
                GL.uniformMatrix4fv(this.Ground.Uniforms.uViewProjection, false, Frame.ViewProjection);
                GL.uniform1f(this.Ground.Uniforms.uGroundHeight, Frame.GroundHeight ?? 0);
                GL.uniform3fv(this.Ground.Uniforms.uCameraPosition, Frame.CameraPosition);
                GL.uniform3fv(this.Ground.Uniforms.uSunDirection, Frame.SunDirection);
                GL.uniform1f(this.Ground.Uniforms.uFogDensity, Settings.FogDensity);
                GL.bindVertexArray(this.EmptyVertexArray);
                GL.enable(GL.POLYGON_OFFSET_FILL);
                GL.polygonOffset(1, 1);
                GL.drawArrays(GL.TRIANGLES, 0, 3);
                GL.disable(GL.POLYGON_OFFSET_FILL);
            }
        }
        GL.disable(GL.SCISSOR_TEST);

        // Occlusion queries against the finished depth buffer (results consumed next frames).
        if (Frame.OcclusionTests && Frame.OcclusionTests.length) {
            GL.useProgram(this.Lines.Program);
            GL.uniformMatrix4fv(this.Lines.Uniforms.uViewProjection, false, Frame.ViewProjection);
            GL.bindVertexArray(this.CubeVertexArray);
            GL.colorMask(false, false, false, false);
            GL.depthMask(false);
            GL.disable(GL.CULL_FACE);
            for (const Test of Frame.OcclusionTests) {
                if (this.Queries.has(Test.Key)) continue; // previous query still pending
                const Query = GL.createQuery();
                GL.uniformMatrix4fv(this.Lines.Uniforms.uModel, false, Test.BoxTransform);
                GL.beginQuery(GL.ANY_SAMPLES_PASSED_CONSERVATIVE, Query);
                GL.drawArrays(GL.TRIANGLES, 0, this.CubeVertexCount);
                GL.endQuery(GL.ANY_SAMPLES_PASSED_CONSERVATIVE);
                this.Queries.set(Test.Key, { Query, Issued: Frame.Index });
            }
            GL.colorMask(true, true, true, true);
            GL.depthMask(true);
        }

        // Debug lines (frozen view volume, picked cluster bounds, instance bounds).
        if (Frame.Lines && Frame.Lines.length) {
            GL.useProgram(this.Lines.Program);
            GL.uniformMatrix4fv(this.Lines.Uniforms.uViewProjection, false, Frame.ViewProjection);
            GL.uniformMatrix4fv(this.Lines.Uniforms.uModel, false, IdentityModel);
            GL.bindVertexArray(this.LineVertexArray);
            GL.bindBuffer(GL.ARRAY_BUFFER, this.LineBuffer);
            for (const Batch of Frame.Lines) {
                GL.bufferData(GL.ARRAY_BUFFER, Batch.Positions, GL.STREAM_DRAW);
                GL.uniform4fv(this.Lines.Uniforms.uColour, Batch.Colour);
                if (Batch.Overlay) GL.disable(GL.DEPTH_TEST);
                GL.drawArrays(GL.LINES, 0, Batch.Positions.length / 3);
                GL.enable(GL.DEPTH_TEST);
            }
        }
        GL.bindVertexArray(null);
        if (Timer) {
            GL.endQuery(this.TimerExtension.TIME_ELAPSED_EXT);
            this.TimerQueries.push(Timer);
        }
    }

    // Returns true/false when a query result is available, undefined while pending.
    ConsumeOcclusion(Key) {
        const Entry = this.Queries.get(Key);
        if (!Entry) return undefined;
        const GL = this.GL;
        if (!GL.getQueryParameter(Entry.Query, GL.QUERY_RESULT_AVAILABLE)) return undefined;
        const Visible = GL.getQueryParameter(Entry.Query, GL.QUERY_RESULT) > 0;
        GL.deleteQuery(Entry.Query);
        this.Queries.delete(Key);
        return Visible;
    }

    DiscardOcclusionQueries() {
        for (const Entry of this.Queries.values()) this.GL.deleteQuery(Entry.Query);
        this.Queries.clear();
    }

    CollectTimer() {
        const GL = this.GL;
        if (!this.TimerExtension) return;
        const Disjoint = GL.getParameter(this.TimerExtension.GPU_DISJOINT_EXT);
        while (this.TimerQueries.length) {
            const Query = this.TimerQueries[0];
            if (!GL.getQueryParameter(Query, GL.QUERY_RESULT_AVAILABLE)) break;
            const Nanoseconds = GL.getQueryParameter(Query, GL.QUERY_RESULT);
            if (!Disjoint) this.GpuMilliseconds = this.GpuMilliseconds * 0.85 + (Nanoseconds / 1e6) * 0.15;
            GL.deleteQuery(Query);
            this.TimerQueries.shift();
        }
    }

    QueryGpuMilliseconds() { return this.TimerExtension ? this.GpuMilliseconds : null; }
}
