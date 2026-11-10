/*==========================================================================================================================================
                                                           UVVIEWPORT3D.JS
==========================================================================================================================================*/
// Synchronized Three.js WebGL2 3D mesh viewport for Frontier UV Studio:
//   - Live UV texture & UDIM tile mapping (RepeatWrapping + per-UDIM tint/checker/texel/importance/stretch shading)
//   - Real-time 3D Seam overlay & Wireframe edges
//   - Direct 3D face/island picking & 3D edge seam toggling synced with the 2D UV Stage

import * as THREE from '../Vendor/three.esm.min.js';
import { OrbitControls } from '../Vendor/orbit-controls.esm.min.js';
import { EdgeKey, UdimFromUV } from './TopologySurface.js';

function BuildCheckerTexture()
{
    const Size = 512;
    const Canvas = document.createElement('canvas');
    Canvas.width = Size;
    Canvas.height = Size;
    const Ctx = Canvas.getContext('2d');
    const Cells = 8;
    const Step = Size / Cells;

    const Palette = [
        '#36434b', '#3f4d47', '#4a4534', '#413a4b',
        '#344150', '#454a3b', '#4e3c3a', '#354845'
    ];
    for (let y = 0; y < Cells; y++)
    {
        for (let x = 0; x < Cells; x++)
        {
            Ctx.fillStyle = Palette[(x * 3 + y * 5) % Palette.length];
            Ctx.fillRect(x * Step, y * Step, Step, Step);
            const Half = Step * 0.5;
            Ctx.fillStyle = 'rgba(255,255,255,0.09)';
            Ctx.fillRect(x * Step, y * Step, Half, Half);
            Ctx.fillRect(x * Step + Half, y * Step + Half, Half, Half);
            Ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            Ctx.strokeRect(x * Step + 0.5, y * Step + 0.5, Step - 1, Step - 1);
            Ctx.fillStyle = 'rgba(255,255,255,0.52)';
            Ctx.font = '600 13px ui-monospace, monospace';
            Ctx.fillText(`${String.fromCharCode(65 + x)}${Cells - y}`, x * Step + 7, y * Step + 20);
        }
    }

    const Tex = new THREE.CanvasTexture(Canvas);
    Tex.wrapS = THREE.RepeatWrapping;
    Tex.wrapT = THREE.RepeatWrapping;
    Tex.colorSpace = THREE.SRGBColorSpace;
    Tex.anisotropy = 4;
    return Tex;
}

function BuildMatcapTexture(Variant = 'clay')
{
    const Size = 512;
    const Canvas = document.createElement('canvas');
    Canvas.width = Size;
    Canvas.height = Size;
    const Ctx = Canvas.getContext('2d');
    const Img = Ctx.createImageData(Size, Size);
    const Data = Img.data;

    const IsSatin = Variant === 'matcap-satin';
    const BaseDark = IsSatin ? [24, 27, 32] : [74, 46, 36];
    const BaseMid = IsSatin ? [92, 100, 110] : [178, 120, 96];
    const SpecCol = IsSatin ? [239, 244, 207] : [255, 232, 214];
    const RimCol = IsSatin ? [138, 186, 224] : [158, 207, 255];

    const Lx = 0.40, Ly = 0.58, Lz = 0.707;
    const Hx = Lx * 0.5, Hy = Ly * 0.5, Hz = (Lz + 1) * 0.5;
    const HLen = Math.hypot(Hx, Hy, Hz);
    const Hnx = Hx / HLen, Hny = Hy / HLen, Hnz = Hz / HLen;

    const Fx = -0.58, Fy = -0.35, Fz = 0.73;

    for (let y = 0; y < Size; y++)
    {
        const Ny = 1 - (2 * (y + 0.5)) / Size;
        for (let x = 0; x < Size; x++)
        {
            const Nx = (2 * (x + 0.5)) / Size - 1;
            const R2 = Nx * Nx + Ny * Ny;
            const Nz = R2 <= 1 ? Math.sqrt(1 - R2) : 0;
            const idx = (y * Size + x) * 4;

            if (R2 > 1.0)
            {
                const Edge = Math.max(0, 1 - (R2 - 1) * 6);
                Data[idx] = BaseDark[0];
                Data[idx + 1] = BaseDark[1];
                Data[idx + 2] = BaseDark[2];
                Data[idx + 3] = Math.round(Edge * 255);
                continue;
            }

            const NdL = Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz);
            const Wrap = Math.max(0, Math.min(1, (Nx * Lx + Ny * Ly + Nz * Lz + 0.45) / 1.45));
            const NdH = Math.max(0, Nx * Hnx + Ny * Hny + Nz * Hnz);
            const Spec = Math.pow(NdH, IsSatin ? 42 : 22) * (IsSatin ? 0.85 : 0.42);
            const Fill = Math.max(0, Nx * Fx + Ny * Fy + Nz * Fz) * 0.20;
            const Fresnel = Math.pow(1 - Nz, 2.8) * (IsSatin ? 0.42 : 0.24);

            const R = Math.min(255, BaseDark[0] + (BaseMid[0] - BaseDark[0]) * Wrap + SpecCol[0] * Spec + RimCol[0] * (Fresnel + Fill) + NdL * 24);
            const G = Math.min(255, BaseDark[1] + (BaseMid[1] - BaseDark[1]) * Wrap + SpecCol[1] * Spec + RimCol[1] * (Fresnel + Fill) + NdL * 22);
            const B = Math.min(255, BaseDark[2] + (BaseMid[2] - BaseDark[2]) * Wrap + SpecCol[2] * Spec + RimCol[2] * (Fresnel + Fill) + NdL * 20);

            Data[idx] = R;
            Data[idx + 1] = G;
            Data[idx + 2] = B;
            Data[idx + 3] = 255;
        }
    }
    Ctx.putImageData(Img, 0, 0);
    const Tex = new THREE.CanvasTexture(Canvas);
    Tex.colorSpace = THREE.SRGBColorSpace;
    return Tex;
}

function BuildVertexDotTexture()
{
    const Size = 64;
    const Canvas = document.createElement('canvas');
    Canvas.width = Size;
    Canvas.height = Size;
    const Ctx = Canvas.getContext('2d');
    Ctx.beginPath();
    Ctx.arc(Size * 0.5, Size * 0.5, Size * 0.42, 0, Math.PI * 2);
    Ctx.fillStyle = '#eff4cf';
    Ctx.fill();
    Ctx.lineWidth = 6;
    Ctx.strokeStyle = '#0b0b0b';
    Ctx.stroke();
    const Tex = new THREE.CanvasTexture(Canvas);
    Tex.colorSpace = THREE.SRGBColorSpace;
    return Tex;
}

function AppendEdgeTube(OutArr, A, B, Radius)
{
    const Dx = B[0] - A[0], Dy = B[1] - A[1], Dz = B[2] - A[2];
    const Len = Math.hypot(Dx, Dy, Dz);
    if (Len < 1e-7) return;
    const Nx = Dx / Len, Ny = Dy / Len, Nz = Dz / Len;
    const Upx = Math.abs(Ny) < 0.88 ? 0 : 1;
    const Upy = Math.abs(Ny) < 0.88 ? 1 : 0;
    const Upz = 0;

    let Ux = Ny * Upz - Nz * Upy;
    let Uy = Nz * Upx - Nx * Upz;
    let Uz = Nx * Upy - Ny * Upx;
    const UL = Math.hypot(Ux, Uy, Uz) || 1;
    Ux = (Ux / UL) * Radius;
    Uy = (Uy / UL) * Radius;
    Uz = (Uz / UL) * Radius;

    let Vx = Ny * Uz - Nz * Uy;
    let Vy = Nz * Ux - Nx * Uz;
    let Vz = Nx * Uy - Ny * Ux;
    const VL = Math.hypot(Vx, Vy, Vz) || 1;
    Vx = (Vx / VL) * Radius;
    Vy = (Vy / VL) * Radius;
    Vz = (Vz / VL) * Radius;

    const RingA = [
        [A[0] - Ux - Vx, A[1] - Uy - Vy, A[2] - Uz - Vz],
        [A[0] + Ux - Vx, A[1] + Uy - Vy, A[2] + Uz - Vz],
        [A[0] + Ux + Vx, A[1] + Uy + Vy, A[2] + Uz + Vz],
        [A[0] - Ux + Vx, A[1] - Uy + Vy, A[2] - Uz + Vz]
    ];
    const RingB = [
        [B[0] - Ux - Vx, B[1] - Uy - Vy, B[2] - Uz - Vz],
        [B[0] + Ux - Vx, B[1] + Uy - Vy, B[2] + Uz - Vz],
        [B[0] + Ux + Vx, B[1] + Uy + Vy, B[2] + Uz + Vz],
        [B[0] - Ux + Vx, B[1] - Uy + Vy, B[2] - Uz + Vz]
    ];
    for (let s = 0; s < 4; s++)
    {
        const s2 = (s + 1) % 4;
        const a0 = RingA[s], a1 = RingA[s2], b0 = RingB[s], b1 = RingB[s2];
        OutArr.push(
            a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], b1[0], b1[1], b1[2],
            a0[0], a0[1], a0[2], b1[0], b1[1], b1[2], b0[0], b0[1], b0[2]
        );
    }
}

function ComputeCreaseCornerNormals(Surface, CreaseAngleDeg = 52)
{
    const CosCrease = Math.cos((CreaseAngleDeg * Math.PI) / 180);
    const VertFaces = new Map();
    for (let fi = 0; fi < Surface.faces.length; fi++)
    {
        for (const C of Surface.faces[fi].corners)
        {
            if (!VertFaces.has(C.v)) VertFaces.set(C.v, []);
            VertFaces.get(C.v).push(fi);
        }
    }
    const CornerNormals = new Array(Surface.faces.length);
    for (let fi = 0; fi < Surface.faces.length; fi++)
    {
        const Fn = Surface.faceNormals[fi] || [0, 1, 0];
        const C = Surface.faces[fi].corners;
        const List = new Array(C.length);
        for (let ci = 0; ci < C.length; ci++)
        {
            const Adj = VertFaces.get(C[ci].v) || [fi];
            let Sx = 0, Sy = 0, Sz = 0;
            for (const Afi of Adj)
            {
                const An = Surface.faceNormals[Afi] || Fn;
                if (Fn[0] * An[0] + Fn[1] * An[1] + Fn[2] * An[2] >= CosCrease)
                {
                    Sx += An[0]; Sy += An[1]; Sz += An[2];
                }
            }
            const L = Math.hypot(Sx, Sy, Sz) || 1;
            List[ci] = [Sx / L, Sy / L, Sz / L];
        }
        CornerNormals[fi] = List;
    }
    return CornerNormals;
}

function HeatRgb(T)
{
    const C = Math.max(0, Math.min(1, T));
    if (C < 0.35)
    {
        const K = C / 0.35;
        return [(68 + K * 37) / 255, (148 + K * 64) / 255, (235 - K * 65) / 255];
    }
    if (C < 0.7)
    {
        const K = (C - 0.35) / 0.35;
        return [(105 + K * 137) / 255, (212 - K * 18) / 255, (170 - K * 74) / 255];
    }
    const K = (C - 0.7) / 0.3;
    return [(242 - K * 10) / 255, (194 - K * 99) / 255, (96 - K * 14) / 255];
}

function HexToRgb01(Hex)
{
    const Clean = (Hex || '#eff4cf').replace('#', '');
    const Num = parseInt(Clean.length === 3 ? Clean.split('').map(C => C + C).join('') : Clean, 16);
    return [((Num >> 16) & 255) / 255, ((Num >> 8) & 255) / 255, (Num & 255) / 255];
}

export class UVViewport3D
{
    constructor(Container, { onPickFace = null, onPickEdge = null, onPickVertex = null, onToggleEdgeSeam = null, onContextMenu = null, onBoxSelect3D = null, onPaintSelect3D = null } = {})
    {
        this.container = Container;
        this.onPickFace = onPickFace;
        this.onPickEdge = onPickEdge;
        this.onPickVertex = onPickVertex;
        this.onToggleEdgeSeam = onToggleEdgeSeam;
        this.onContextMenu = onContextMenu;
        this.onBoxSelect3D = onBoxSelect3D;
        this.onPaintSelect3D = onPaintSelect3D;
        this.shadingMode = 'checker'; // 'checker' | 'flat' | 'matcap' | 'matcap-satin' | 'importance' | 'texel' | 'stretch'
        this.selectionMode = 'island';
        this.activeTool = 'select';
        this.paintRadiusPx = 36;
        this.showWireframe = true;
        this.showSeams = true;
        this.showBoundaries = true;
        this.webglReady = false;
        this.triToFace = [];
        this.surface = null;
        this.hoveredEdge = null;
        this.edgeNormalMap = new Map();
        this.edgeScaleRadius = 0.008;

        this.InitScene();
    }

    InitScene()
    {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'viewport-webgl-canvas';
        this.container.append(this.canvas);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#101214');
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 220);
        this.camera.position.set(5.4, 2.6, 6.2);

        try
        {
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.08;
            this.webglReady = true;
        }
        catch
        {
            this.webglReady = false;
            return;
        }

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 0.85, 0);

        this.scene.add(new THREE.HemisphereLight('#dce6ec', '#2e2b25', 1.45));
        const Key = new THREE.DirectionalLight('#fff2dd', 2.4);
        Key.position.set(5, 8, 5);
        this.scene.add(Key);
        const Fill = new THREE.DirectionalLight('#9ecfff', 1.2);
        Fill.position.set(-5, 4, -4);
        this.scene.add(Fill);
        const Rim = new THREE.DirectionalLight('#9bdac5', 0.9);
        Rim.position.set(0, 3, -6);
        this.scene.add(Rim);

        const Grid = new THREE.GridHelper(16, 32, '#3d4346', '#212527');
        Grid.position.y = -0.002;
        this.scene.add(Grid);

        this.checkerTex = BuildCheckerTexture();
        this.matcapClayTex = BuildMatcapTexture('clay');
        this.matcapSatinTex = BuildMatcapTexture('matcap-satin');
        this.vertexDotTex = BuildVertexDotTexture();

        this.meshMat = new THREE.MeshStandardMaterial({
            map: this.checkerTex,
            vertexColors: true,
            roughness: 0.48,
            metalness: 0.08,
            flatShading: false,
            side: THREE.DoubleSide
        });
        this.matcapMat = new THREE.MeshMatcapMaterial({
            matcap: this.matcapClayTex,
            vertexColors: false,
            side: THREE.DoubleSide
        });

        this.geometry = new THREE.BufferGeometry();
        this.mesh = new THREE.Mesh(this.geometry, this.meshMat);
        this.scene.add(this.mesh);

        // GPU Face-Selection Mask Texture (256 x H, 1 texel per mesh face -> 0.02ms instant live updates!)
        this.gpuSelTexW = 256;
        this.gpuSelTexH = 16;
        this.gpuSelectionTex = new THREE.DataTexture(
            new Uint8Array(this.gpuSelTexW * this.gpuSelTexH * 4),
            this.gpuSelTexW,
            this.gpuSelTexH,
            THREE.RGBAFormat
        );
        this.gpuSelectionTex.minFilter = THREE.NearestFilter;
        this.gpuSelectionTex.magFilter = THREE.NearestFilter;
        this.gpuSelectionTex.generateMipmaps = false;
        this.gpuSelectionTex.needsUpdate = true;

        this.gpuSelOverlayMat = new THREE.ShaderMaterial({
            uniforms: {
                uSelTex: { value: this.gpuSelectionTex },
                uTexSize: { value: new THREE.Vector2(this.gpuSelTexW, this.gpuSelTexH) }
            },
            vertexShader: `
                attribute float aFaceId;
                varying float vFaceId;
                void main() {
                    vFaceId = aFaceId;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying float vFaceId;
                uniform sampler2D uSelTex;
                uniform vec2 uTexSize;
                void main() {
                    float fid = floor(vFaceId + 0.5);
                    float tx = mod(fid, uTexSize.x);
                    float ty = floor(fid / uTexSize.x);
                    float sel = texture2D(uSelTex, (vec2(tx, ty) + 0.5) / uTexSize).r;
                    if (sel < 0.5) discard;
                    gl_FragColor = vec4(0.96, 0.72, 0.24, 0.38);
                }
            `,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3,
            toneMapped: false,
            side: THREE.DoubleSide
        });
        this.selectedFaceOverlayMesh = new THREE.Mesh(this.geometry, this.gpuSelOverlayMat);
        this.selectedFaceOverlayMesh.renderOrder = 2;
        this.scene.add(this.selectedFaceOverlayMesh);

        // GPU Offscreen Face-ID Picker Scene (hardware Z-buffer occlusion, 24-bit face index)
        this.pickScene = new THREE.Scene();
        this.pickScene.background = null;
        this.pickMat = new THREE.ShaderMaterial({
            vertexShader: `
                attribute float aFaceId;
                varying float vFaceId;
                void main() {
                    vFaceId = aFaceId;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying float vFaceId;
                void main() {
                    float id = floor(vFaceId + 0.5) + 1.0;
                    float b = floor((id + 0.001) / 65536.0);
                    float rem = id - b * 65536.0;
                    float g = floor((rem + 0.001) / 256.0);
                    float r = rem - g * 256.0;
                    gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
                }
            `,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: true,
            dithering: false,
            toneMapped: false
        });
        this.pickMesh = new THREE.Mesh(this.geometry, this.pickMat);
        this.pickScene.add(this.pickMesh);
        this.gpuPickRT = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            generateMipmaps: false
        });
        this.pickW = 0;
        this.pickH = 0;
        this.cachedPickPixels = null;
        this.pickBufferDirty = true;
        this._strokeSeenFaces = new Set();
        this._islandByFaceCache = new Map();
        this.controls.addEventListener('change', () => { this.pickBufferDirty = true; });

        this.wireGeo = new THREE.BufferGeometry();
        this.wireLines = new THREE.LineSegments(this.wireGeo, new THREE.LineBasicMaterial({
            color: '#ffffff', transparent: true, opacity: 0.16
        }));
        this.scene.add(this.wireLines);

        this.boundaryGeo = new THREE.BufferGeometry();
        this.boundaryLines = new THREE.LineSegments(this.boundaryGeo, new THREE.LineBasicMaterial({
            color: '#7bd4b8', transparent: true, opacity: 0.78
        }));
        this.scene.add(this.boundaryLines);

        // Thick 3D tubes for crisp Seams, Selected Edges, Active Edge, and Hovered Edge
        this.seamGeo = new THREE.BufferGeometry();
        this.seamMesh = new THREE.Mesh(this.seamGeo, new THREE.MeshBasicMaterial({
            color: '#ff5d47'
        }));
        this.seamMesh.renderOrder = 3;
        this.scene.add(this.seamMesh);

        this.selectedEdgeGeo = new THREE.BufferGeometry();
        this.selectedEdgeMesh = new THREE.Mesh(this.selectedEdgeGeo, new THREE.MeshBasicMaterial({
            color: '#eff4cf'
        }));
        this.selectedEdgeMesh.renderOrder = 4;
        this.scene.add(this.selectedEdgeMesh);

        this.selectedEdgeGhostGeo = new THREE.BufferGeometry();
        this.selectedEdgeGhostLines = new THREE.LineSegments(this.selectedEdgeGhostGeo, new THREE.LineBasicMaterial({
            color: '#eff4cf', transparent: true, opacity: 0.25, depthTest: false
        }));
        this.selectedEdgeGhostLines.renderOrder = 4;
        this.scene.add(this.selectedEdgeGhostLines);

        this.activeEdgeGeo = new THREE.BufferGeometry();
        this.activeEdgeMesh = new THREE.Mesh(this.activeEdgeGeo, new THREE.MeshBasicMaterial({
            color: '#ff9d3b'
        }));
        this.activeEdgeMesh.renderOrder = 5;
        this.scene.add(this.activeEdgeMesh);

        this.hoverEdgeGeo = new THREE.BufferGeometry();
        this.hoverEdgeMat = new THREE.MeshBasicMaterial({
            color: '#7dd3fc'
        });
        this.hoverEdgeMesh = new THREE.Mesh(this.hoverEdgeGeo, this.hoverEdgeMat);
        this.hoverEdgeMesh.renderOrder = 6;
        this.scene.add(this.hoverEdgeMesh);

        this.selectedVertGeo = new THREE.BufferGeometry();
        this.selectedVertPoints = new THREE.Points(this.selectedVertGeo, new THREE.PointsMaterial({
            color: '#ffffff',
            map: this.vertexDotTex,
            size: 13,
            sizeAttenuation: false,
            transparent: true,
            alphaTest: 0.2,
            depthTest: true
        }));
        this.selectedVertPoints.renderOrder = 7;
        this.scene.add(this.selectedVertPoints);

        // 3D Box Select Marquee & 3D Paint Select Brush Ring DOM Overlays
        this.marqueeEl = document.createElement('div');
        this.marqueeEl.className = 'uv-marquee-3d';
        this.marqueeEl.hidden = true;
        this.brushEl = document.createElement('div');
        this.brushEl.className = 'uv-brush-3d';
        this.brushEl.hidden = true;
        this.container.append(this.marqueeEl, this.brushEl);

        // Pointer picking, hover edge preview, 3D Box Select & 3D Paint Select
        let DownPt = null;
        let RightDownPt = null;
        let BoxDrag = null;
        let PaintDrag = null;

        const UpdateBrushRing = (E) =>
        {
            if (this.activeTool !== 'circle') { this.brushEl.hidden = true; return; }
            const R = this.container.getBoundingClientRect();
            const X = E.clientX - R.left, Y = E.clientY - R.top;
            const Diam = Math.max(16, this.paintRadiusPx * 2);
            this.brushEl.hidden = false;
            this.brushEl.style.left = `${X}px`;
            this.brushEl.style.top = `${Y}px`;
            this.brushEl.style.width = `${Diam}px`;
            this.brushEl.style.height = `${Diam}px`;
            this.brushEl.classList.toggle('subtract', !!E.ctrlKey);
        };

        this.canvas.addEventListener('pointerdown', E =>
        {
            if (E.button === 2) RightDownPt = [E.clientX, E.clientY];
            if (E.button !== 0) return;
            DownPt = [E.clientX, E.clientY];

            // Alt+LMB always falls through to orbit even when Box or Paint Select is active
            if (E.altKey)
            {
                if (this.activeTool === 'box' || this.activeTool === 'circle')
                {
                    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
                }
                return;
            }

            const R = this.container.getBoundingClientRect();
            const X = E.clientX - R.left, Y = E.clientY - R.top;

            if (this.activeTool === 'box')
            {
                this.controls.enabled = false;
                BoxDrag = { x0: X, y0: Y, x1: X, y1: Y, additive: E.shiftKey, subtract: E.ctrlKey };
                this.marqueeEl.hidden = false;
                this.marqueeEl.style.left = `${X}px`;
                this.marqueeEl.style.top = `${Y}px`;
                this.marqueeEl.style.width = '0px';
                this.marqueeEl.style.height = '0px';
                this.canvas.setPointerCapture(E.pointerId);
                return;
            }
            if (this.activeTool === 'circle')
            {
                this.controls.enabled = false;
                this._strokeSeenFaces.clear();
                this.EnsureGpuPickBuffer(R);
                PaintDrag = { subtract: E.ctrlKey };
                UpdateBrushRing(E);
                this.DispatchPaintSelect3D(X, Y, R, { subtract: E.ctrlKey, commit: false });
                this.canvas.setPointerCapture(E.pointerId);
            }
        });

        this.canvas.addEventListener('pointermove', E =>
        {
            if (BoxDrag)
            {
                const R = this.container.getBoundingClientRect();
                BoxDrag.x1 = E.clientX - R.left;
                BoxDrag.y1 = E.clientY - R.top;
                const MinX = Math.min(BoxDrag.x0, BoxDrag.x1);
                const MinY = Math.min(BoxDrag.y0, BoxDrag.y1);
                this.marqueeEl.style.left = `${MinX}px`;
                this.marqueeEl.style.top = `${MinY}px`;
                this.marqueeEl.style.width = `${Math.abs(BoxDrag.x1 - BoxDrag.x0)}px`;
                this.marqueeEl.style.height = `${Math.abs(BoxDrag.y1 - BoxDrag.y0)}px`;
                return;
            }
            if (PaintDrag)
            {
                const R = this.container.getBoundingClientRect();
                const X = E.clientX - R.left, Y = E.clientY - R.top;
                UpdateBrushRing(E);
                this.DispatchPaintSelect3D(X, Y, R, { subtract: PaintDrag.subtract || E.ctrlKey, commit: false });
                return;
            }
            if (this.activeTool === 'circle') UpdateBrushRing(E);
            else if (!this.brushEl.hidden) this.brushEl.hidden = true;

            if (E.buttons !== 0) return;
            this.UpdateHover(E);
        });

        this.canvas.addEventListener('pointerleave', () =>
        {
            this.ClearHover();
            if (this.brushEl) this.brushEl.hidden = true;
        });

        this.canvas.addEventListener('pointerup', E =>
        {
            if (BoxDrag && E.button === 0)
            {
                const B = BoxDrag;
                BoxDrag = null;
                this.marqueeEl.hidden = true;
                this.controls.enabled = true;
                try { this.canvas.releasePointerCapture(E.pointerId); } catch {}
                const MinX = Math.min(B.x0, B.x1), MaxX = Math.max(B.x0, B.x1);
                const MinY = Math.min(B.y0, B.y1), MaxY = Math.max(B.y0, B.y1);
                if (MaxX - MinX < 5 && MaxY - MinY < 5)
                {
                    this.HandleClick(E);
                }
                else
                {
                    const R = this.container.getBoundingClientRect();
                    this.DispatchBoxSelect3D(MinX, MinY, MaxX, MaxY, R, { additive: B.additive, subtract: B.subtract, xray: E.altKey });
                }
                DownPt = null;
                return;
            }
            if (PaintDrag && E.button === 0)
            {
                const Sub = PaintDrag.subtract || E.ctrlKey;
                PaintDrag = null;
                this._strokeSeenFaces.clear();
                this.controls.enabled = true;
                try { this.canvas.releasePointerCapture(E.pointerId); } catch {}
                const R = this.container.getBoundingClientRect();
                this.DispatchPaintSelect3D(E.clientX - R.left, E.clientY - R.top, R, { subtract: Sub, commit: true });
                DownPt = null;
                return;
            }
            if (E.button === 0)
            {
                if (this.activeTool === 'box' || this.activeTool === 'circle')
                {
                    this.controls.mouseButtons.LEFT = null;
                }
                const Moved = !DownPt || Math.hypot(E.clientX - DownPt[0], E.clientY - DownPt[1]) > 5;
                DownPt = null;
                if (!Moved) this.HandleClick(E);
            }
        });

        this.canvas.addEventListener('wheel', E =>
        {
            if (this.activeTool === 'circle' && E.shiftKey)
            {
                E.preventDefault();
                E.stopPropagation();
                this.paintRadiusPx = Math.max(12, Math.min(160, this.paintRadiusPx + (E.deltaY < 0 ? 6 : -6)));
                UpdateBrushRing(E);
            }
        }, { passive: false, capture: true });
        this.canvas.addEventListener('dblclick', E =>
        {
            if (this.activeTool === 'seam') return;
            if (this.selectionMode === 'edge')
            {
                const HitEdge = this.FindHitEdge(E);
                if (HitEdge && this.onPickEdge)
                {
                    this.onPickEdge(HitEdge.va, HitEdge.vb, { additive: E.shiftKey, loop: true, ring: false, path: false, faceIndex: HitEdge.faceIndex });
                }
                return;
            }
            if (this.selectionMode === 'face' || this.selectionMode === 'island')
            {
                const Pick = this.RaycastMesh(E);
                if (Pick && this.onPickFace)
                {
                    this.onPickFace(Pick.faceIndex, E.shiftKey, { island: true });
                }
            }
        });
        this.canvas.addEventListener('contextmenu', E =>
        {
            const Moved = RightDownPt && Math.hypot(E.clientX - RightDownPt[0], E.clientY - RightDownPt[1]) > 5;
            RightDownPt = null;
            if (!Moved && this.onContextMenu)
            {
                E.preventDefault();
                const HitEdge = this.FindHitEdge(E);
                this.onContextMenu(E.clientX, E.clientY, HitEdge);
            }
        });

        const Resize = () =>
        {
            const R = this.container.getBoundingClientRect();
            if (!R.width || !R.height || !this.webglReady) return;
            this.renderer.setSize(R.width, R.height, false);
            this.camera.aspect = R.width / R.height;
            this.camera.updateProjectionMatrix();
            this.pickBufferDirty = true;
        };
        new ResizeObserver(Resize).observe(this.container);
        Resize();

        const Loop = () =>
        {
            requestAnimationFrame(Loop);
            if (!this.webglReady) return;
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        requestAnimationFrame(Loop);
    }

    SetActiveTool(Tool)
    {
        this.activeTool = Tool;
        if (this.controls)
        {
            const IsMarqueeOrBrush = Tool === 'box' || Tool === 'circle';
            this.controls.mouseButtons.LEFT = IsMarqueeOrBrush ? null : THREE.MOUSE.ROTATE;
            this.controls.mouseButtons.MIDDLE = IsMarqueeOrBrush ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY;
        }
        if (this.canvas)
        {
            this.canvas.style.cursor = Tool === 'box' ? 'crosshair' : Tool === 'circle' ? 'none' : Tool === 'seam' ? 'crosshair' : 'default';
        }
        if (this.brushEl && Tool !== 'circle') this.brushEl.hidden = true;
    }

    _ProjectScreen(PosArr, Rect)
    {
        const V = new THREE.Vector3(PosArr[0], PosArr[1], PosArr[2]).project(this.camera);
        if (V.z < -1 || V.z > 1) return null;
        return [(V.x * 0.5 + 0.5) * Rect.width, (-V.y * 0.5 + 0.5) * Rect.height, V.z];
    }

    _IsFaceFrontFacing(FaceIdx)
    {
        const F = this.surface?.faces?.[FaceIdx];
        const N = this.surface?.faceNormals?.[FaceIdx];
        if (!F || !N) return true;
        let Cx = 0, Cy = 0, Cz = 0;
        for (const C of F.corners)
        {
            const P = this.surface.positions[C.v];
            Cx += P[0]; Cy += P[1]; Cz += P[2];
        }
        const Inv = 1 / Math.max(1, F.corners.length);
        const Vx = this.camera.position.x - Cx * Inv;
        const Vy = this.camera.position.y - Cy * Inv;
        const Vz = this.camera.position.z - Cz * Inv;
        return (N[0] * Vx + N[1] * Vy + N[2] * Vz) > -0.04;
    }

    EnsureGpuPickBuffer(Rect)
    {
        if (!this.webglReady || !this.surface || !Rect?.width || !Rect?.height) return false;
        const Scale = Math.min(1, 640 / Math.max(Rect.width, Rect.height));
        const W = Math.max(64, Math.round(Rect.width * Scale));
        const H = Math.max(64, Math.round(Rect.height * Scale));
        if (!this.pickBufferDirty && this.cachedPickPixels && this.pickW === W && this.pickH === H)
        {
            return true;
        }
        if (this.pickW !== W || this.pickH !== H)
        {
            this.gpuPickRT.setSize(W, H);
            this.pickW = W;
            this.pickH = H;
            this.cachedPickPixels = new Uint8Array(W * H * 4);
        }
        this.camera.updateMatrixWorld();
        const PrevRT = this.renderer.getRenderTarget();
        const PrevClear = this.renderer.getClearColor(new THREE.Color());
        const PrevAlpha = this.renderer.getClearAlpha();
        this.renderer.setRenderTarget(this.gpuPickRT);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear(true, true, false);
        this.renderer.render(this.pickScene, this.camera);
        this.renderer.readRenderTargetPixels(this.gpuPickRT, 0, 0, W, H, this.cachedPickPixels);
        this.renderer.setRenderTarget(PrevRT);
        this.renderer.setClearColor(PrevClear, PrevAlpha);
        this.pickBufferDirty = false;
        return true;
    }

    FastUpdateGpuFaceMask(Surface, Islands = null)
    {
        if (!this.webglReady || !Surface || !this.gpuSelectionTex) return;
        const FaceCount = Surface.faces.length;
        const W = this.gpuSelTexW;
        const NeedH = Math.max(1, Math.ceil(FaceCount / W));
        if (NeedH !== this.gpuSelTexH || this.gpuSelectionTex.image.data.length !== W * NeedH * 4)
        {
            this.gpuSelTexH = NeedH;
            this.gpuSelectionTex.dispose();
            this.gpuSelectionTex = new THREE.DataTexture(new Uint8Array(W * NeedH * 4), W, NeedH, THREE.RGBAFormat);
            this.gpuSelectionTex.minFilter = THREE.NearestFilter;
            this.gpuSelectionTex.magFilter = THREE.NearestFilter;
            this.gpuSelectionTex.generateMipmaps = false;
            this.gpuSelOverlayMat.uniforms.uSelTex.value = this.gpuSelectionTex;
            this.gpuSelOverlayMat.uniforms.uTexSize.value.set(W, NeedH);
        }
        const Data = this.gpuSelectionTex.image.data;
        Data.fill(0);
        if (this.selectionMode === 'island' && Islands)
        {
            for (const Isl of Islands)
            {
                if (!Isl.hidden && Surface.selectedIslands.has(Isl.id))
                {
                    for (const fi of Isl.faceIndices) Data[fi * 4] = 255;
                }
            }
        }
        for (const fi of Surface.selectedFaces)
        {
            if (fi >= 0 && fi < FaceCount) Data[fi * 4] = 255;
        }
        if (this.selectionMode === 'vertex' && Surface.selectedUVs.size)
        {
            for (let fi = 0; fi < FaceCount; fi++)
            {
                for (const C of Surface.faces[fi].corners)
                {
                    if (Surface.selectedUVs.has(C.uv)) { Data[fi * 4] = 255; break; }
                }
            }
        }
        else if (this.selectionMode === 'edge' && Surface.selectedEdges3D.size)
        {
            for (let fi = 0; fi < FaceCount; fi++)
            {
                const Cr = Surface.faces[fi].corners;
                for (let k = 0; k < Cr.length; k++)
                {
                    if (Surface.selectedEdges3D.has(EdgeKey(Cr[k].v, Cr[(k + 1) % Cr.length].v)))
                    {
                        Data[fi * 4] = 255; break;
                    }
                }
            }
        }
        this.gpuSelectionTex.needsUpdate = true;
        this.selectedFaceOverlayMesh.visible = true;
    }

    DispatchBoxSelect3D(MinX, MinY, MaxX, MaxY, Rect, { additive = false, subtract = false, xray = false } = {})
    {
        if (!this.surface || !this.onBoxSelect3D || !Rect.width || !Rect.height) return;
        const InBox = (Pt) => Pt && Pt[0] >= MinX && Pt[0] <= MaxX && Pt[1] >= MinY && Pt[1] <= MaxY;
        const VertHits = new Set();
        const EdgeHits = new Set();

        if (!xray && this.EnsureGpuPickBuffer(Rect))
        {
            const Sx = this.pickW / Rect.width;
            const Sy = this.pickH / Rect.height;
            const X0 = Math.max(0, Math.floor(MinX * Sx));
            const X1 = Math.min(this.pickW - 1, Math.ceil(MaxX * Sx));
            const Y0 = Math.max(0, Math.floor((Rect.height - MaxY) * Sy));
            const Y1 = Math.min(this.pickH - 1, Math.ceil((Rect.height - MinY) * Sy));
            const FaceSet = new Set();
            const Px = this.cachedPickPixels;
            const W = this.pickW;
            const MaxFace = this.surface.faces.length;

            for (let y = Y0; y <= Y1; y++)
            {
                let idx = (y * W + X0) * 4;
                for (let x = X0; x <= X1; x++, idx += 4)
                {
                    if (Px[idx + 3] === 0) continue;
                    const Id = Px[idx] + (Px[idx + 1] << 8) + (Px[idx + 2] << 16);
                    if (Id > 0 && Id <= MaxFace) FaceSet.add(Id - 1);
                }
            }
            const FaceHits = [...FaceSet];
            if (this.selectionMode === 'vertex' || this.selectionMode === 'edge')
            {
                this.camera.updateMatrixWorld();
                for (const fi of FaceHits)
                {
                    const Cr = this.surface.faces[fi].corners;
                    for (const C of Cr)
                    {
                        const Sp = this._ProjectScreen(this.surface.positions[C.v], Rect);
                        if (InBox(Sp)) VertHits.add(C.v);
                    }
                    if (this.selectionMode === 'edge')
                    {
                        for (let k = 0; k < Cr.length; k++)
                        {
                            const Va = Cr[k].v, Vb = Cr[(k + 1) % Cr.length].v;
                            const Pa = this.surface.positions[Va], Pb = this.surface.positions[Vb];
                            const MidSp = this._ProjectScreen([0.5 * (Pa[0] + Pb[0]), 0.5 * (Pa[1] + Pb[1]), 0.5 * (Pa[2] + Pb[2])], Rect);
                            if (InBox(MidSp) || (VertHits.has(Va) && VertHits.has(Vb))) EdgeHits.add(EdgeKey(Va, Vb));
                        }
                    }
                }
            }
            this.onBoxSelect3D({ faces: FaceHits, verts3d: [...VertHits], edges3d: [...EdgeHits] }, { additive, subtract });
            return;
        }

        this.camera.updateMatrixWorld();
        const FaceHits = [];
        for (let fi = 0; fi < this.surface.faces.length; fi++)
        {
            if (!xray && !this._IsFaceFrontFacing(fi)) continue;
            const F = this.surface.faces[fi];
            let Cx = 0, Cy = 0, Cz = 0;
            let AnyCornerIn = false;
            for (const C of F.corners)
            {
                const P = this.surface.positions[C.v];
                Cx += P[0]; Cy += P[1]; Cz += P[2];
                const Sp = this._ProjectScreen(P, Rect);
                if (InBox(Sp)) { AnyCornerIn = true; VertHits.add(C.v); }
            }
            const Inv = 1 / Math.max(1, F.corners.length);
            const CenterSp = this._ProjectScreen([Cx * Inv, Cy * Inv, Cz * Inv], Rect);
            if (InBox(CenterSp) || AnyCornerIn)
            {
                FaceHits.push(fi);
                for (let k = 0; k < F.corners.length; k++)
                {
                    const Va = F.corners[k].v, Vb = F.corners[(k + 1) % F.corners.length].v;
                    const Pa = this.surface.positions[Va], Pb = this.surface.positions[Vb];
                    const MidSp = this._ProjectScreen([0.5 * (Pa[0] + Pb[0]), 0.5 * (Pa[1] + Pb[1]), 0.5 * (Pa[2] + Pb[2])], Rect);
                    if (InBox(MidSp) || (VertHits.has(Va) && VertHits.has(Vb))) EdgeHits.add(EdgeKey(Va, Vb));
                }
            }
        }
        this.onBoxSelect3D({ faces: FaceHits, verts3d: [...VertHits], edges3d: [...EdgeHits] }, { additive, subtract });
    }

    DispatchPaintSelect3D(Sx, Sy, Rect, { subtract = false, commit = false } = {})
    {
        if (!this.surface || !this.onPaintSelect3D || !Rect.width || !Rect.height) return;
        if (commit && this.EnsureGpuPickBuffer(Rect) === false) return;

        const Rad = Math.max(8, this.paintRadiusPx);
        const FaceSet = new Set();

        if (this.EnsureGpuPickBuffer(Rect))
        {
            const ScaleX = this.pickW / Rect.width;
            const ScaleY = this.pickH / Rect.height;
            const Cx = Sx * ScaleX;
            const Cy = (Rect.height - Sy) * ScaleY;
            const Rx = Math.max(2, Rad * ScaleX);
            const Ry = Math.max(2, Rad * ScaleY);
            const X0 = Math.max(0, Math.floor(Cx - Rx));
            const X1 = Math.min(this.pickW - 1, Math.ceil(Cx + Rx));
            const Y0 = Math.max(0, Math.floor(Cy - Ry));
            const Y1 = Math.min(this.pickH - 1, Math.ceil(Cy + Ry));
            const InvRx2 = 1 / (Rx * Rx);
            const InvRy2 = 1 / (Ry * Ry);
            const Px = this.cachedPickPixels;
            const W = this.pickW;
            const MaxFace = this.surface.faces.length;

            for (let y = Y0; y <= Y1; y++)
            {
                const Dy = y - Cy;
                const DyTerm = Dy * Dy * InvRy2;
                if (DyTerm > 1) continue;
                let idx = (y * W + X0) * 4;
                for (let x = X0; x <= X1; x++, idx += 4)
                {
                    const Dx = x - Cx;
                    if (Dx * Dx * InvRx2 + DyTerm > 1) continue;
                    if (Px[idx + 3] === 0) continue;
                    const Id = Px[idx] + (Px[idx + 1] << 8) + (Px[idx + 2] << 16);
                    if (Id > 0 && Id <= MaxFace)
                    {
                        const Fi = Id - 1;
                        if (!commit && this._strokeSeenFaces.has(Fi)) continue;
                        FaceSet.add(Fi);
                        if (!commit) this._strokeSeenFaces.add(Fi);
                    }
                }
            }
        }

        const FaceHits = [...FaceSet];
        if (!commit && FaceHits.length === 0) return;

        const VertHits = new Set();
        const EdgeHits = new Set();
        if (FaceHits.length && (this.selectionMode === 'vertex' || this.selectionMode === 'edge'))
        {
            this.camera.updateMatrixWorld();
            const InBrush = (Pt) => Pt && Math.hypot(Pt[0] - Sx, Pt[1] - Sy) <= Rad;
            for (const fi of FaceHits)
            {
                const Cr = this.surface.faces[fi].corners;
                for (const C of Cr)
                {
                    const Sp = this._ProjectScreen(this.surface.positions[C.v], Rect);
                    if (InBrush(Sp)) VertHits.add(C.v);
                }
                if (this.selectionMode === 'edge')
                {
                    for (let k = 0; k < Cr.length; k++)
                    {
                        const Va = Cr[k].v, Vb = Cr[(k + 1) % Cr.length].v;
                        const Pa = this.surface.positions[Va], Pb = this.surface.positions[Vb];
                        const MidSp = this._ProjectScreen([0.5 * (Pa[0] + Pb[0]), 0.5 * (Pa[1] + Pb[1]), 0.5 * (Pa[2] + Pb[2])], Rect);
                        if (InBrush(MidSp)) EdgeHits.add(EdgeKey(Va, Vb));
                    }
                }
            }
        }
        this.onPaintSelect3D({ faces: FaceHits, verts3d: [...VertHits], edges3d: [...EdgeHits] }, { subtract, commit });
    }

    RaycastMesh(Event)
    {
        if (!this.webglReady || !this.surface || !this.triToFace.length) return null;
        const Rect = this.canvas.getBoundingClientRect();
        if (!Rect.width || !Rect.height) return null;
        const Ptr = new THREE.Vector2(
            ((Event.clientX - Rect.left) / Rect.width) * 2 - 1,
            -((Event.clientY - Rect.top) / Rect.height) * 2 + 1
        );
        const Ray = new THREE.Raycaster();
        Ray.setFromCamera(Ptr, this.camera);
        const Hits = Ray.intersectObject(this.mesh, false);
        if (!Hits.length) return null;
        const Hit = Hits[0];
        const FaceIndex = this.triToFace[Hit.faceIndex];
        if (FaceIndex === undefined) return null;
        return { hit: Hit, faceIndex: FaceIndex };
    }

    FindHitEdge(Event)
    {
        const Pick = this.RaycastMesh(Event);
        if (!Pick) return null;
        const { hit, faceIndex } = Pick;
        const F = this.surface.faces[faceIndex];
        if (!F) return null;
        const Hp = hit.point;
        let BestEdge = null, BestD = Infinity;
        for (let k = 0; k < F.corners.length; k++)
        {
            const Va = F.corners[k].v, Vb = F.corners[(k + 1) % F.corners.length].v;
            const A = this.surface.positions[Va], B = this.surface.positions[Vb];
            const D = PointToSeg3D(Hp.x, Hp.y, Hp.z, A, B);
            if (D < BestD)
            {
                BestD = D;
                BestEdge = { va: Va, vb: Vb, key: EdgeKey(Va, Vb), faceIndex, point: Hp };
            }
        }
        return BestEdge;
    }

    FindHitVertex(Event)
    {
        const Pick = this.RaycastMesh(Event);
        if (!Pick) return null;
        const { hit, faceIndex } = Pick;
        const F = this.surface.faces[faceIndex];
        if (!F) return null;
        const Hp = hit.point;
        let BestV = null, BestD = Infinity;
        for (const C of F.corners)
        {
            const P = this.surface.positions[C.v];
            const D = Math.hypot(Hp.x - P[0], Hp.y - P[1], Hp.z - P[2]);
            if (D < BestD) { BestD = D; BestV = C.v; }
        }
        return BestV !== null ? { v: BestV, faceIndex } : null;
    }

    UpdateHover(Event)
    {
        const WantEdgeHover = this.activeTool === 'seam' || (this.selectionMode === 'edge' && this.activeTool !== 'box' && this.activeTool !== 'circle') || (Event.altKey && this.activeTool === 'select');
        if (!WantEdgeHover)
        {
            this.ClearHover();
            this.canvas.style.cursor = this.activeTool === 'box' ? 'crosshair' : this.activeTool === 'circle' ? 'none' : this.activeTool === 'seam' ? 'crosshair' : 'default';
            return;
        }
        const Edge = this.FindHitEdge(Event);
        this.hoveredEdge = Edge;
        if (!Edge)
        {
            this.hoverEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
            this.hoverEdgeMesh.visible = false;
            this.canvas.style.cursor = this.activeTool === 'seam' ? 'crosshair' : 'default';
            return;
        }
        this.hoverEdgeMat.color.set(this.activeTool === 'seam' ? '#ff8b78' : '#7dd3fc');
        this.canvas.style.cursor = this.activeTool === 'seam' ? 'crosshair' : 'pointer';

        const A = this.surface.positions[Edge.va];
        const B = this.surface.positions[Edge.vb];
        const N = this.edgeNormalMap.get(Edge.key) || this.surface.faceNormals[Edge.faceIndex] || [0, 1, 0];
        const Lift = this.edgeScaleRadius * 0.45;
        const P0 = [A[0] + N[0] * Lift, A[1] + N[1] * Lift, A[2] + N[2] * Lift];
        const P1 = [B[0] + N[0] * Lift, B[1] + N[1] * Lift, B[2] + N[2] * Lift];
        const Arr = [];
        AppendEdgeTube(Arr, P0, P1, this.edgeScaleRadius * 1.32);
        this.hoverEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(Arr, 3));
        this.hoverEdgeGeo.computeVertexNormals();
        this.hoverEdgeMesh.visible = true;
    }

    ClearHover()
    {
        if (!this.hoveredEdge) return;
        this.hoveredEdge = null;
        this.hoverEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.hoverEdgeMesh.visible = false;
    }

    HandleClick(Event)
    {
        if (!this.webglReady || !this.surface) return;

        // 1. Dedicated Seam Brush tool: click edge = toggle seam, Alt+click = toggle seam loop
        if (this.activeTool === 'seam')
        {
            const Edge = this.FindHitEdge(Event);
            if (Edge && this.onToggleEdgeSeam)
            {
                this.onToggleEdgeSeam(Edge.va, Edge.vb, { loop: Event.altKey, faceIndex: Edge.faceIndex });
            }
            return;
        }

        // 2. Edge Selection Mode (Blender-faithful modifiers: Click, Shift+Click, Alt+Click Loop, Ctrl+Alt+Click Ring, Ctrl+Click Path)
        if (this.selectionMode === 'edge')
        {
            const Edge = this.FindHitEdge(Event);
            if (!Edge) return;
            if (this.onPickEdge)
            {
                this.onPickEdge(Edge.va, Edge.vb, {
                    additive: Event.shiftKey,
                    loop: Event.altKey && !Event.ctrlKey,
                    ring: Event.ctrlKey && Event.altKey,
                    path: Event.ctrlKey && !Event.altKey,
                    faceIndex: Edge.faceIndex
                });
            }
            return;
        }

        // 3. Vertex Selection Mode (Click, Shift+Click, Alt+Click Edge Loop, Ctrl+Click Shortest Path)
        if (this.selectionMode === 'vertex')
        {
            if (Event.altKey && !Event.ctrlKey)
            {
                const Edge = this.FindHitEdge(Event);
                if (Edge && this.onPickVertex)
                {
                    this.onPickVertex(Edge.va, { additive: Event.shiftKey, loop: true, edgeVa: Edge.va, edgeVb: Edge.vb, faceIndex: Edge.faceIndex });
                    return;
                }
            }
            const VHit = this.FindHitVertex(Event);
            if (VHit && this.onPickVertex)
            {
                this.onPickVertex(VHit.v, { additive: Event.shiftKey, path: Event.ctrlKey && !Event.altKey, faceIndex: VHit.faceIndex });
                return;
            }
        }

        // 4. Face Mode Blender Modifiers: Alt+Click = Face Loop, Ctrl+Click = Shortest Face Path, Shift+Alt+Click = Quick Seam
        if (this.selectionMode === 'face' && (Event.altKey || Event.ctrlKey))
        {
            if (Event.shiftKey && Event.altKey)
            {
                const Edge = this.FindHitEdge(Event);
                if (Edge && this.onToggleEdgeSeam)
                {
                    this.onToggleEdgeSeam(Edge.va, Edge.vb, { loop: true, faceIndex: Edge.faceIndex });
                }
                return;
            }
            if (Event.altKey && !Event.ctrlKey)
            {
                const Edge = this.FindHitEdge(Event);
                if (Edge && this.onPickFace)
                {
                    this.onPickFace(Edge.faceIndex, Event.shiftKey, { loop: true, edgeVa: Edge.va, edgeVb: Edge.vb });
                }
                return;
            }
            if (Event.ctrlKey && !Event.altKey)
            {
                const Pick = this.RaycastMesh(Event);
                if (Pick && this.onPickFace)
                {
                    this.onPickFace(Pick.faceIndex, Event.shiftKey, { path: true });
                }
                return;
            }
        }

        // 5. Quick Seam shortcut in Island mode via Alt+Click / Ctrl+Click
        if (Event.altKey || Event.ctrlKey)
        {
            const Edge = this.FindHitEdge(Event);
            if (Edge && this.onToggleEdgeSeam)
            {
                this.onToggleEdgeSeam(Edge.va, Edge.vb, { loop: Event.shiftKey && Event.altKey, faceIndex: Edge.faceIndex });
            }
            return;
        }

        // 6. Face / Island picking
        const Pick = this.RaycastMesh(Event);
        if (Pick && this.onPickFace) this.onPickFace(Pick.faceIndex, Event.shiftKey, {});
    }

    CameraPreset(Preset)
    {
        if (!this.webglReady) return;
        let Target = new THREE.Vector3(0, 0.85, 0);
        let Radius = 1.9;
        if (this.surface && this.surface.positions.length)
        {
            let MinX = Infinity, MaxX = -Infinity;
            let MinY = Infinity, MaxY = -Infinity;
            let MinZ = Infinity, MaxZ = -Infinity;
            for (const P of this.surface.positions)
            {
                if (P[0] < MinX) MinX = P[0]; if (P[0] > MaxX) MaxX = P[0];
                if (P[1] < MinY) MinY = P[1]; if (P[1] > MaxY) MaxY = P[1];
                if (P[2] < MinZ) MinZ = P[2]; if (P[2] > MaxZ) MaxZ = P[2];
            }
            Target.set(0.5 * (MinX + MaxX), 0.5 * (MinY + MaxY), 0.5 * (MinZ + MaxZ));
            Radius = Math.max(1.1, 0.5 * Math.hypot(MaxX - MinX, MaxY - MinY, MaxZ - MinZ));
        }
        const Scale = Radius / 1.85;
        this.controls.target.copy(Target);
        if (Preset === 'Front') this.camera.position.set(Target.x + 5.2 * Scale, Target.y + 0.4 * Scale, Target.z + 0.01);
        else if (Preset === 'Side') this.camera.position.set(Target.x, Target.y + 0.4 * Scale, Target.z + 5.2 * Scale);
        else if (Preset === 'Top') this.camera.position.set(Target.x, Target.y + 5.4 * Scale, Target.z + 0.01);
        else this.camera.position.set(Target.x + 3.8 * Scale, Target.y + 1.8 * Scale, Target.z + 4.4 * Scale);
        this.controls.update();
    }

    SyncFromSurface(Surface, Islands, ImportanceGroups, TargetTexelDensity = 10)
    {
        this.surface = Surface;
        if (!this.webglReady || !Surface) return;

        const PosArr = [];
        const NormArr = [];
        const UvArr = [];
        const ColArr = [];
        const FaceIdArr = [];
        const WireArr = [];
        const BoundaryArr = [];
        const SeamTubeArr = [];
        const SelEdgeTubeArr = [];
        const SelEdgeGhostArr = [];
        const ActiveEdgeTubeArr = [];
        const SelVertArr = [];
        this.triToFace = [];
        this.edgeNormalMap.clear();
        this.pickBufferDirty = true;

        const IslandByFace = new Map();
        for (const Isl of Islands)
        {
            for (const Fi of Isl.faceIndices) IslandByFace.set(Fi, Isl);
        }
        const GroupColors = new Map(ImportanceGroups.map(G => [G.id, HexToRgb01(G.color)]));
        const UdimTints = [
            [0.95, 0.96, 0.92],
            [0.78, 0.90, 1.00],
            [0.98, 0.88, 0.70],
            [0.74, 0.94, 0.85]
        ];

        const IsMatcap = this.shadingMode === 'matcap' || this.shadingMode === 'matcap-satin';
        const IsFlat = this.shadingMode === 'flat';
        const CreaseNormals = IsMatcap ? ComputeCreaseCornerNormals(Surface, 52) : null;

        if (IsMatcap)
        {
            this.matcapMat.matcap = this.shadingMode === 'matcap-satin' ? this.matcapSatinTex : this.matcapClayTex;
            this.matcapMat.needsUpdate = true;
            this.mesh.material = this.matcapMat;
        }
        else
        {
            this.meshMat.map = this.shadingMode === 'checker' ? this.checkerTex : null;
            this.meshMat.flatShading = IsFlat;
            this.meshMat.needsUpdate = true;
            this.mesh.material = this.meshMat;
        }

        // Track edge face counts, selection boundary counts, & averaged normal per unique 3D edge
        const EdgeAccum = new Map();

        for (let fi = 0; fi < Surface.faces.length; fi++)
        {
            const F = Surface.faces[fi];
            const Isl = IslandByFace.get(fi);
            if (Isl?.hidden) continue;

            const Corners = F.corners;
            const FaceN = Surface.faceNormals[fi] || [0, 1, 0];
            const SmoothN = CreaseNormals ? CreaseNormals[fi] : null;
            const IsSel = Surface.selectedFaces.has(fi) || (Isl && Surface.selectedIslands.has(Isl.id));

            // Determine face color based on 3D shading lens
            let R = 0.85, G = 0.86, B = 0.85;
            if (this.shadingMode === 'checker')
            {
                const TileIdx = Math.max(0, (Isl?.udimTile || 1001) - 1001) % UdimTints.length;
                [R, G, B] = UdimTints[TileIdx];
            }
            else if (this.shadingMode === 'flat')
            {
                R = 0.76; G = 0.78; B = 0.80;
            }
            else if (this.shadingMode === 'importance')
            {
                const GrpRgb = Isl?.importanceGroupId ? GroupColors.get(Isl.importanceGroupId) : null;
                [R, G, B] = GrpRgb || [0.42, 0.45, 0.48];
            }
            else if (this.shadingMode === 'texel')
            {
                const Ratio = (Isl?.texelDensity || 0) / Math.max(0.1, TargetTexelDensity);
                const T = Math.max(0, Math.min(1, 0.35 + Math.log2(Math.max(0.125, Ratio)) * 0.28));
                [R, G, B] = HeatRgb(T);
            }
            else if (this.shadingMode === 'stretch')
            {
                const D = Surface.FaceTrianglesDistortion(fi);
                [R, G, B] = HeatRgb(Math.min(1, D.angleStretch * 2.2));
            }

            if (IsSel && !IsMatcap)
            {
                R = Math.min(1, R * 0.62 + 0.96 * 0.42);
                G = Math.min(1, G * 0.62 + 0.76 * 0.42);
                B = Math.min(1, B * 0.62 + 0.28 * 0.42);
            }

            for (let k = 1; k < Corners.length - 1; k++)
            {
                const Idxs = [0, k, k + 1];
                for (const ci of Idxs)
                {
                    const C = Corners[ci];
                    const Pt = Surface.positions[C.v];
                    const Uv = Surface.uvCoords[C.uv];
                    const Nrm = SmoothN ? SmoothN[ci] : FaceN;
                    PosArr.push(Pt[0], Pt[1], Pt[2]);
                    NormArr.push(Nrm[0], Nrm[1], Nrm[2]);
                    UvArr.push(Uv[0], Uv[1]);
                    ColArr.push(R, G, B);
                    FaceIdArr.push(fi);
                }
                this.triToFace.push(fi);
            }

            const Eps = 0.002;
            for (let k = 0; k < Corners.length; k++)
            {
                const Va = Corners[k].v, Vb = Corners[(k + 1) % Corners.length].v;
                const A = Surface.positions[Va], Bpt = Surface.positions[Vb];
                WireArr.push(
                    A[0] + FaceN[0] * Eps, A[1] + FaceN[1] * Eps, A[2] + FaceN[2] * Eps,
                    Bpt[0] + FaceN[0] * Eps, Bpt[1] + FaceN[1] * Eps, Bpt[2] + FaceN[2] * Eps
                );

                const K3 = EdgeKey(Va, Vb);
                if (!EdgeAccum.has(K3))
                {
                    EdgeAccum.set(K3, { va: Va, vb: Vb, nx: FaceN[0], ny: FaceN[1], nz: FaceN[2], count: 1, selFaceCount: IsSel ? 1 : 0 });
                }
                else
                {
                    const Acc = EdgeAccum.get(K3);
                    Acc.nx += FaceN[0]; Acc.ny += FaceN[1]; Acc.nz += FaceN[2];
                    Acc.count++;
                    if (IsSel) Acc.selFaceCount++;
                }
            }
        }

        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(PosArr, 3));
        this.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(NormArr, 3));
        this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(UvArr, 2));
        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(ColArr, 3));
        this.geometry.setAttribute('aFaceId', new THREE.Float32BufferAttribute(FaceIdArr, 1));
        this.geometry.computeBoundingSphere();

        const ModelRadius = this.geometry.boundingSphere?.radius || 2.0;
        const BaseR = Math.max(0.0038, Math.min(0.022, ModelRadius * 0.0042));
        this.edgeScaleRadius = BaseR;

        // Selected vertices in Vertex mode
        const SelVert3DSet = new Set();
        if (this.selectionMode === 'vertex')
        {
            for (const F of Surface.faces)
            {
                for (const C of F.corners)
                {
                    if (Surface.selectedUVs.has(C.uv)) SelVert3DSet.add(C.v);
                }
            }
            for (const V of SelVert3DSet)
            {
                const P = Surface.positions[V];
                if (P) SelVertArr.push(P[0], P[1], P[2]);
            }
        }

        const IsRegionMode = this.selectionMode === 'face' || this.selectionMode === 'island';

        for (const [K3, Acc] of EdgeAccum)
        {
            const NLen = Math.hypot(Acc.nx, Acc.ny, Acc.nz) || 1;
            const Nx = Acc.nx / NLen, Ny = Acc.ny / NLen, Nz = Acc.nz / NLen;
            this.edgeNormalMap.set(K3, [Nx, Ny, Nz]);

            const A = Surface.positions[Acc.va], Bpt = Surface.positions[Acc.vb];
            if (Acc.count === 1)
            {
                const BEps = BaseR * 0.4;
                BoundaryArr.push(
                    A[0] + Nx * BEps, A[1] + Ny * BEps, A[2] + Nz * BEps,
                    Bpt[0] + Nx * BEps, Bpt[1] + Ny * BEps, Bpt[2] + Nz * BEps
                );
            }
            if (Surface.seams.has(K3))
            {
                const SEps = BaseR * 0.35;
                AppendEdgeTube(
                    SeamTubeArr,
                    [A[0] + Nx * SEps, A[1] + Ny * SEps, A[2] + Nz * SEps],
                    [Bpt[0] + Nx * SEps, Bpt[1] + Ny * SEps, Bpt[2] + Nz * SEps],
                    BaseR * 0.70
                );
            }

            const ShowSelEdge = IsRegionMode
                ? (Acc.selFaceCount === 1) // crisp selection perimeter around selected faces/islands
                : Surface.selectedEdges3D.has(K3);

            if (ShowSelEdge)
            {
                const EEps = BaseR * 0.45;
                const P0 = [A[0] + Nx * EEps, A[1] + Ny * EEps, A[2] + Nz * EEps];
                const P1 = [Bpt[0] + Nx * EEps, Bpt[1] + Ny * EEps, Bpt[2] + Nz * EEps];
                const IsActiveEdge = !IsRegionMode && Surface.activeEdge3D === K3;
                AppendEdgeTube(IsActiveEdge ? ActiveEdgeTubeArr : SelEdgeTubeArr, P0, P1, IsActiveEdge ? BaseR * 1.45 : BaseR * 1.15);
                SelEdgeGhostArr.push(P0[0], P0[1], P0[2], P1[0], P1[1], P1[2]);
            }
        }

        this.FastUpdateGpuFaceMask(Surface, Islands);

        this.wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(WireArr, 3));
        this.wireLines.visible = this.showWireframe;

        this.boundaryGeo.setAttribute('position', new THREE.Float32BufferAttribute(BoundaryArr, 3));
        this.boundaryLines.visible = this.showBoundaries;

        this.seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(SeamTubeArr, 3));
        this.seamMesh.visible = this.showSeams && SeamTubeArr.length > 0;

        this.selectedEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(SelEdgeTubeArr, 3));
        this.selectedEdgeMesh.visible = SelEdgeTubeArr.length > 0;

        this.selectedEdgeGhostGeo.setAttribute('position', new THREE.Float32BufferAttribute(SelEdgeGhostArr, 3));
        this.selectedEdgeGhostLines.visible = SelEdgeGhostArr.length > 0 && !IsRegionMode;

        this.activeEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ActiveEdgeTubeArr, 3));
        this.activeEdgeMesh.visible = ActiveEdgeTubeArr.length > 0;

        this.selectedVertGeo.setAttribute('position', new THREE.Float32BufferAttribute(SelVertArr, 3));
        this.selectedVertPoints.visible = SelVertArr.length > 0;
    }
}

function PointToSeg3D(Px, Py, Pz, A, B)
{
    const Abx = B[0] - A[0], Aby = B[1] - A[1], Abz = B[2] - A[2];
    const Len2 = Abx * Abx + Aby * Aby + Abz * Abz || 1e-8;
    const T = Math.max(0, Math.min(1, ((Px - A[0]) * Abx + (Py - A[1]) * Aby + (Pz - A[2]) * Abz) / Len2));
    return Math.hypot(Px - (A[0] + T * Abx), Py - (A[1] + T * Aby), Pz - (A[2] + T * Abz));
}
