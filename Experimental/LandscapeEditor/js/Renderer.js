// 📦 WebGL2 terrain renderer — lit heightfield mesh with the satmap as albedo, a sea plane, contour lines and orbit or top cameras.

const VertexSource = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUv;
uniform mat4 uViewProjection;
uniform float uWaterMode;
uniform float uSeaHeight;
uniform float uScale;
out vec3 vNormal;
out vec2 vUv;
out vec3 vWorld;
void main() {
    vec3 Position = aPosition;
    Position.y *= uScale;
    if (uWaterMode > 0.5) {
        Position.y = uSeaHeight;
    }
    vNormal = normalize(vec3(aNormal.x * uScale, aNormal.y, aNormal.z * uScale));
    vUv = aUv;
    vWorld = Position;
    gl_Position = uViewProjection * vec4(Position, 1.0);
}
`;

const FragmentSource = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
in vec3 vWorld;
uniform sampler2D uSatmap;
uniform float uWaterMode;
uniform float uShading;
uniform vec3 uSunDirection;
uniform vec3 uWaterColour;
uniform float uContours;
uniform float uContourInterval;
uniform float uHeightMax;
uniform float uSeaHeight;
out vec4 oColour;

vec3 HeightRamp(float T) {
    vec3 A = vec3(0.09, 0.14, 0.26);
    vec3 B = vec3(0.24, 0.42, 0.34);
    vec3 C = vec3(0.56, 0.52, 0.30);
    vec3 D = vec3(0.86, 0.84, 0.82);
    if (T < 0.4) return mix(A, B, T / 0.4);
    if (T < 0.75) return mix(B, C, (T - 0.4) / 0.35);
    return mix(C, D, (T - 0.75) / 0.25);
}

void main() {
    vec3 Normal = normalize(vNormal);
    float Lambert = max(dot(Normal, normalize(uSunDirection)), 0.0);
    float Sky = 0.5 + 0.5 * Normal.y;
    vec3 Light = vec3(1.0, 0.96, 0.88) * Lambert * 1.35 + vec3(0.46, 0.52, 0.62) * Sky * 0.8 + vec3(0.12);

    if (uWaterMode > 0.5) {
        float Fresnel = pow(1.0 - max(Normal.y, 0.0), 3.0);
        vec3 Colour = uWaterColour * (0.6 + 0.4 * Sky) + vec3(0.35) * Fresnel;
        oColour = vec4(Colour, 0.86);
        return;
    }

    vec3 Albedo;
    if (uShading < 0.5) {
        Albedo = texture(uSatmap, vUv).rgb;
    } else if (uShading < 1.5) {
        Albedo = vec3(0.62, 0.61, 0.58);
    } else {
        Albedo = HeightRamp(clamp(vWorld.y / max(uHeightMax, 1.0), 0.0, 1.0));
    }
    vec3 Colour = Albedo * Light;

    if (uContours > 0.5) {
        float Level = vWorld.y / uContourInterval;
        float Line = 1.0 - smoothstep(0.0, 0.06, abs(fract(Level) - 0.5) - 0.44);
        Colour = mix(Colour, vec3(0.08, 0.06, 0.05), Line * 0.55);
    }
    oColour = vec4(Colour, 1.0);
}
`;

/// in    Shader    [-]  WebGL2 context used to compile
/// in    Type      [-]  gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
/// in    Source    [-]  GLSL ES 3.00 source text
/// out   Shader    [-]  compiled shader; throws with the info log on failure
function CompileShader(Gl, Type, Source) {
    const Shader = Gl.createShader(Type);
    Gl.shaderSource(Shader, Source);
    Gl.compileShader(Shader);
    if (!Gl.getShaderParameter(Shader, Gl.COMPILE_STATUS)) {
        throw new Error(Gl.getShaderInfoLog(Shader));
    }
    return Shader;
}

/// in    A, B    [-]  4×4 column-major matrices
/// out   Product [-]  A × B
function Multiply(A, B) {
    const Out = new Float32Array(16);
    for (let Column = 0; Column < 4; Column++) {
        for (let Row = 0; Row < 4; Row++) {
            let Sum = 0;
            for (let K = 0; K < 4; K++) {
                Sum += A[K * 4 + Row] * B[Column * 4 + K];
            }
            Out[Column * 4 + Row] = Sum;
        }
    }
    return Out;
}

/// in    Fov      [rad]  vertical field of view
/// in    Aspect   [-]    width over height
/// in    Near     [m]    near plane
/// in    Far      [m]    far plane
/// out   Matrix   [-]    perspective projection
function Perspective(Fov, Aspect, Near, Far) {
    const F = 1 / Math.tan(Fov / 2);
    const Out = new Float32Array(16);
    Out[0] = F / Aspect;
    Out[5] = F;
    Out[10] = (Far + Near) / (Near - Far);
    Out[11] = -1;
    Out[14] = (2 * Far * Near) / (Near - Far);
    return Out;
}

/// in    Half     [m]    half extent of the view volume vertically
/// in    Aspect   [-]    width over height
/// in    Near     [m]    near plane
/// in    Far      [m]    far plane
/// out   Matrix   [-]    orthographic projection
function Orthographic(Half, Aspect, Near, Far) {
    const Out = new Float32Array(16);
    Out[0] = 1 / (Half * Aspect);
    Out[5] = 1 / Half;
    Out[10] = -2 / (Far - Near);
    Out[14] = -(Far + Near) / (Far - Near);
    Out[15] = 1;
    return Out;
}

/// in    Eye      [m]  camera position
/// in    Target   [m]  look-at point
/// in    Up       [-]  up vector
/// out   Matrix   [-]  view matrix
function LookAt(Eye, Target, Up) {
    let Fz = [Eye[0] - Target[0], Eye[1] - Target[1], Eye[2] - Target[2]];
    const LengthF = Math.hypot(...Fz) || 1;
    Fz = Fz.map((V) => V / LengthF);
    let Fx = [Up[1] * Fz[2] - Up[2] * Fz[1], Up[2] * Fz[0] - Up[0] * Fz[2], Up[0] * Fz[1] - Up[1] * Fz[0]];
    const LengthX = Math.hypot(...Fx) || 1;
    Fx = Fx.map((V) => V / LengthX);
    const Fy = [Fz[1] * Fx[2] - Fz[2] * Fx[1], Fz[2] * Fx[0] - Fz[0] * Fx[2], Fz[0] * Fx[1] - Fz[1] * Fx[0]];
    const Out = new Float32Array(16);
    Out[0] = Fx[0];
    Out[4] = Fx[1];
    Out[8] = Fx[2];
    Out[1] = Fy[0];
    Out[5] = Fy[1];
    Out[9] = Fy[2];
    Out[2] = Fz[0];
    Out[6] = Fz[1];
    Out[10] = Fz[2];
    Out[12] = -(Fx[0] * Eye[0] + Fx[1] * Eye[1] + Fx[2] * Eye[2]);
    Out[13] = -(Fy[0] * Eye[0] + Fy[1] * Eye[1] + Fy[2] * Eye[2]);
    Out[14] = -(Fz[0] * Eye[0] + Fz[1] * Eye[1] + Fz[2] * Eye[2]);
    Out[15] = 1;
    return Out;
}

/// in    Canvas   [-]  HTMLCanvasElement to draw into
/// out   Viewer   [-]  object with SetHeights, SetSatmap, SetOptions, Frame and Dispose
export function CreateTerrainViewer(Canvas) {
    const Gl = Canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!Gl) {
        throw new Error("WebGL2 is not available in this browser.");
    }
    const Program = Gl.createProgram();
    Gl.attachShader(Program, CompileShader(Gl, Gl.VERTEX_SHADER, VertexSource));
    Gl.attachShader(Program, CompileShader(Gl, Gl.FRAGMENT_SHADER, FragmentSource));
    Gl.bindAttribLocation(Program, 0, "aPosition");
    Gl.bindAttribLocation(Program, 1, "aNormal");
    Gl.bindAttribLocation(Program, 2, "aUv");
    Gl.linkProgram(Program);
    if (!Gl.getProgramParameter(Program, Gl.LINK_STATUS)) {
        throw new Error(Gl.getProgramInfoLog(Program));
    }
    const Uniform = Object.fromEntries(
        ["uViewProjection", "uWaterMode", "uSeaHeight", "uScale", "uSatmap", "uShading", "uSunDirection", "uWaterColour", "uContours", "uContourInterval", "uHeightMax"].map((Name) => [
            Name,
            Gl.getUniformLocation(Program, Name),
        ]),
    );
    const Vao = Gl.createVertexArray();
    const VertexBuffer = Gl.createBuffer();
    const IndexBuffer = Gl.createBuffer();
    const Texture = Gl.createTexture();
    const WaterVao = Gl.createVertexArray();
    const WaterBuffer = Gl.createBuffer();
    const WaterIndex = Gl.createBuffer();
    const State = {
        Count: 0,
        WaterCount: 0,
        Grid: 0,
        World: 1,
        Sea: 0,
        HeightMax: 1,
        Options: { Shading: 0, Water: true, Contours: false, ContourInterval: 100, Top: false, Exaggeration: 1 },
        Yaw: 0.7,
        Pitch: 0.75,
        Distance: 1,
        Dirty: true,
        Frame: 0,
    };
    const Water = [0.13, 0.31, 0.44];

    /// in    Heights   [m]  Float32Array N×N
    /// in    World     [m]  edge length of the square terrain
    /// in    Sea       [m]  sea level
    /// out   None      [-]  rebuilds the mesh and the sea plane
    function SetHeights(Heights, Grid, World, Sea) {
        State.Grid = Grid;
        State.World = World;
        State.Sea = Sea;
        let Low = Infinity;
        let High = -Infinity;
        for (let Index = 0; Index < Heights.length; Index++) {
            Low = Math.min(Low, Heights[Index]);
            High = Math.max(High, Heights[Index]);
        }
        State.HeightMax = Math.max(High, 1);
        const Span = World / (Grid - 1);
        const Vertices = new Float32Array(Grid * Grid * 8);
        const Scale = 1;
        for (let Y = 0; Y < Grid; Y++) {
            for (let X = 0; X < Grid; X++) {
                const Index = Y * Grid + X;
                const Left = Heights[Y * Grid + Math.max(X - 1, 0)];
                const Right = Heights[Y * Grid + Math.min(X + 1, Grid - 1)];
                const Up = Heights[Math.max(Y - 1, 0) * Grid + X];
                const Down = Heights[Math.min(Y + 1, Grid - 1) * Grid + X];
                const DX = (X > 0 && X < Grid - 1 ? 2 : 1) * Span;
                const DZ = (Y > 0 && Y < Grid - 1 ? 2 : 1) * Span;
                const NormalX = -((Right - Left) / DX) * Scale;
                const NormalY = 1;
                const NormalZ = -((Down - Up) / DZ) * Scale;
                const Length = Math.hypot(NormalX, NormalY, NormalZ);
                const Offset = Index * 8;
                Vertices[Offset] = X * Span - World / 2;
                Vertices[Offset + 1] = Heights[Index] * Scale;
                Vertices[Offset + 2] = Y * Span - World / 2;
                Vertices[Offset + 3] = NormalX / Length;
                Vertices[Offset + 4] = NormalY / Length;
                Vertices[Offset + 5] = NormalZ / Length;
                Vertices[Offset + 6] = X / (Grid - 1);
                Vertices[Offset + 7] = Y / (Grid - 1);
            }
        }
        const Indices = new Uint32Array((Grid - 1) * (Grid - 1) * 6);
        let Cursor = 0;
        for (let Y = 0; Y < Grid - 1; Y++) {
            for (let X = 0; X < Grid - 1; X++) {
                const A = Y * Grid + X;
                const B = A + 1;
                const C = A + Grid;
                const D = C + 1;
                Indices.set([A, C, B, B, C, D], Cursor);
                Cursor += 6;
            }
        }
        Gl.bindVertexArray(Vao);
        Gl.bindBuffer(Gl.ARRAY_BUFFER, VertexBuffer);
        Gl.bufferData(Gl.ARRAY_BUFFER, Vertices, Gl.DYNAMIC_DRAW);
        Gl.bindBuffer(Gl.ELEMENT_ARRAY_BUFFER, IndexBuffer);
        Gl.bufferData(Gl.ELEMENT_ARRAY_BUFFER, Indices, Gl.STATIC_DRAW);
        BindTerrainAttributes();
        State.Count = Indices.length;
        const Half = World / 2;
        const Plane = new Float32Array([-Half, 0, -Half, 0, 1, 0, 0, 0, Half, 0, -Half, 0, 1, 0, 1, 0, -Half, 0, Half, 0, 1, 0, 0, 1, Half, 0, Half, 0, 1, 0, 1, 1]);
        Gl.bindVertexArray(WaterVao);
        Gl.bindBuffer(Gl.ARRAY_BUFFER, WaterBuffer);
        Gl.bufferData(Gl.ARRAY_BUFFER, Plane, Gl.STATIC_DRAW);
        Gl.bindBuffer(Gl.ELEMENT_ARRAY_BUFFER, WaterIndex);
        Gl.bufferData(Gl.ELEMENT_ARRAY_BUFFER, new Uint32Array([0, 1, 2, 2, 1, 3]), Gl.STATIC_DRAW);
        BindTerrainAttributes();
        Gl.bindVertexArray(null);
        State.WaterCount = 6;
        State.Dirty = true;
    }

    /// out   None  [-]  binds the 32-byte position, normal, uv layout to the vertex buffer currently bound to ARRAY_BUFFER
    function BindTerrainAttributes() {
        Gl.enableVertexAttribArray(0);
        Gl.vertexAttribPointer(0, 3, Gl.FLOAT, false, 32, 0);
        Gl.enableVertexAttribArray(1);
        Gl.vertexAttribPointer(1, 3, Gl.FLOAT, false, 32, 12);
        Gl.enableVertexAttribArray(2);
        Gl.vertexAttribPointer(2, 2, Gl.FLOAT, false, 32, 24);
    }

    /// in    Pixels   [-]  Uint8ClampedArray RGBA of Grid×Grid
    /// in    Grid     [-]  edge length of the satmap
    /// out   None     [-]  uploads the albedo texture
    function SetSatmap(Pixels, Grid) {
        Gl.bindTexture(Gl.TEXTURE_2D, Texture);
        Gl.pixelStorei(Gl.UNPACK_ALIGNMENT, 1);
        Gl.texImage2D(Gl.TEXTURE_2D, 0, Gl.RGBA, Grid, Grid, 0, Gl.RGBA, Gl.UNSIGNED_BYTE, new Uint8Array(Pixels.buffer, Pixels.byteOffset, Pixels.length));
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.LINEAR_MIPMAP_LINEAR);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.LINEAR);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
        Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);
        Gl.generateMipmap(Gl.TEXTURE_2D);
        State.Dirty = true;
    }

    /// in    Options  [-]  partial { Shading, Water, Contours, ContourInterval, Top, Exaggeration }
    /// out   None     [-]  updates view options and marks the frame dirty
    function SetOptions(Options) {
        Object.assign(State.Options, Options);
        State.Dirty = true;
    }

    /// out   None     [-]  resizes the canvas backing store to match its CSS size
    function Resize() {
        const Ratio = Math.min(window.devicePixelRatio || 1, 2);
        const Width = Math.max(1, Math.floor(Canvas.clientWidth * Ratio));
        const Height = Math.max(1, Math.floor(Canvas.clientHeight * Ratio));
        if (Canvas.width !== Width || Canvas.height !== Height) {
            Canvas.width = Width;
            Canvas.height = Height;
            State.Dirty = true;
        }
    }

    /// in    Dragging   [px]  pointer delta since the last move
    /// out   None       [-]   orbit the camera around the terrain
    function Orbit(DeltaX, DeltaY) {
        State.Yaw -= DeltaX * 0.008;
        State.Pitch = Math.min(Math.max(State.Pitch + DeltaY * 0.008, 0.08), 1.52);
        State.Dirty = true;
    }

    /// in    Steps    [-]  wheel steps; positive zooms out
    /// out   None     [-]  dolly the camera
    function Zoom(Steps) {
        State.Distance = Math.min(Math.max(State.Distance * Math.exp(Steps * 0.0015), 0.25), 6);
        State.Dirty = true;
    }

    /// out   Camera   [-]  view and projection matrices for the current mode
    function Camera(Aspect) {
        const Span = State.World;
        if (State.Options.Top) {
            const View = LookAt([0, Span, 0.0001], [0, 0, 0], [0, 1, 0]);
            const Projection = Orthographic(Span * 0.56 * State.Distance, Aspect, 1, Span * 6);
            return Multiply(Projection, View);
        }
        const Radius = Span * 0.95 * State.Distance;
        const Eye = [
            Math.cos(State.Pitch) * Math.sin(State.Yaw) * Radius,
            Math.sin(State.Pitch) * Radius * 0.9,
            Math.cos(State.Pitch) * Math.cos(State.Yaw) * Radius,
        ];
        const View = LookAt(Eye, [0, State.HeightMax * 0.25 * State.Options.Exaggeration, 0], [0, 1, 0]);
        const Projection = Perspective(0.72, Aspect, Span * 0.002, Span * 8);
        return Multiply(Projection, View);
    }

    /// out   Drawn   [-]  true when a frame was drawn
    function Frame() {
        Resize();
        if (!State.Dirty || !State.Count) {
            return false;
        }
        State.Dirty = false;
        const Aspect = Canvas.width / Math.max(Canvas.height, 1);
        Gl.viewport(0, 0, Canvas.width, Canvas.height);
        Gl.clearColor(0.05, 0.05, 0.05, 1);
        Gl.clear(Gl.COLOR_BUFFER_BIT | Gl.DEPTH_BUFFER_BIT);
        Gl.enable(Gl.DEPTH_TEST);
        Gl.disable(Gl.BLEND);
        Gl.useProgram(Program);
        const ViewProjection = Camera(Aspect);
        const Sun = normalise([-0.55, 0.62, -0.36]);
        Gl.uniformMatrix4fv(Uniform.uViewProjection, false, ViewProjection);
        Gl.uniform3f(Uniform.uSunDirection, Sun[0], Sun[1], Sun[2]);
        Gl.uniform1f(Uniform.uShading, State.Options.Shading);
        Gl.uniform1f(Uniform.uContours, State.Options.Contours ? 1 : 0);
        Gl.uniform1f(Uniform.uContourInterval, State.Options.ContourInterval);
        Gl.uniform1f(Uniform.uHeightMax, State.HeightMax);
        Gl.uniform1f(Uniform.uScale, State.Options.Exaggeration);
        Gl.uniform1f(Uniform.uSeaHeight, State.Sea * State.Options.Exaggeration);
        Gl.uniform1i(Uniform.uSatmap, 0);
        Gl.uniform3f(Uniform.uWaterColour, Water[0], Water[1], Water[2]);
        Gl.activeTexture(Gl.TEXTURE0);
        Gl.bindTexture(Gl.TEXTURE_2D, Texture);
        Gl.uniform1f(Uniform.uWaterMode, 0);
        Gl.bindVertexArray(Vao);
        Gl.drawElements(Gl.TRIANGLES, State.Count, Gl.UNSIGNED_INT, 0);
        if (State.Options.Water) {
            Gl.enable(Gl.BLEND);
            Gl.blendFunc(Gl.SRC_ALPHA, Gl.ONE_MINUS_SRC_ALPHA);
            Gl.depthMask(false);
            Gl.uniform1f(Uniform.uWaterMode, 1);
            Gl.bindVertexArray(WaterVao);
            Gl.drawElements(Gl.TRIANGLES, State.WaterCount, Gl.UNSIGNED_INT, 0);
            Gl.depthMask(true);
            Gl.disable(Gl.BLEND);
        }
        Gl.bindVertexArray(null);
        State.Frame += 1;
        return true;
    }

    /// out   None   [-]  releases GPU resources; the viewer must not be used afterwards
    function Dispose() {
        Gl.deleteProgram(Program);
        Gl.deleteBuffer(VertexBuffer);
        Gl.deleteBuffer(IndexBuffer);
        Gl.deleteTexture(Texture);
    }

    /// in    Vector   [-]  three-component vector
    /// out   Unit     [-]  normalised vector
    function normalise(Vector) {
        const Length = Math.hypot(...Vector) || 1;
        return Vector.map((V) => V / Length);
    }

    Gl.clearColor(0.05, 0.05, 0.05, 1);
    return { SetHeights, SetSatmap, SetOptions, Frame, Orbit, Zoom, Dispose, State, Resize };
}
