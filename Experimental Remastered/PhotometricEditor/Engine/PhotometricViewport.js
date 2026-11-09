/*==========================================================================================================================================
                                                        PHOTOMETRICVIEWPORT.JS
==========================================================================================================================================*/
// Real-time 3D Photometric Calibration Stage & Roadway Homologation Bay using bundled Three.js (three@0.187.0) + OrbitControls,
// with real LM-63 .ies CanvasTexture beam projection, 7 luminaire gizmos, HDR sky dome, Sun, Moon, Stars, Fog, False-Colour Lux contours,
// and automatic Software 3D fallback when WebGL2 is unavailable.

import {
    Clamp,
    ResolveEmissionRgb,
    EvaluateIesIntensity,
    ComputeFlux,
    KelvinToRgb,
    SolveMoonMetrics,
    MoonCatalogue
} from './PhotometryEngine.js';

let ThreeModulePromise = null;

async function LoadThree()
{
    if (!ThreeModulePromise) {
        ThreeModulePromise = Promise.all([
            import('../Vendor/three.esm.min.js'),
            import('../Vendor/orbit-controls.esm.min.js')
        ]).then(([THREE, Controls]) => ({ THREE, OrbitControls: Controls.OrbitControls }));
    }
    return ThreeModulePromise;
}

function BuildIesProjectionCanvas(Props, LoadedProfiles)
{
    const Size = 128;
    const Canvas = document.createElement('canvas');
    Canvas.width = Size;
    Canvas.height = Size;
    const Ctx = Canvas.getContext('2d');
    const Img = Ctx.createImageData(Size, Size);
    const ConeHalfRad = Math.max(0.08, ((Number(Props.cone ?? 58) * 0.5) * Math.PI) / 180);
    const CutoffShift = (Number(Props.cutoff ?? 0) * Math.PI) / 180;

    for (let y = 0; y < Size; y++) {
        for (let x = 0; x < Size; x++) {
            const U = (x / (Size - 1)) * 2 - 1;
            const V = ((y / (Size - 1)) * 2 - 1) + Math.sin(CutoffShift) * 0.6;
            const R = Math.hypot(U, V);
            let Val = 0;
            if (R <= 1.05) {
                const PolarDeg = Clamp(R * (ConeHalfRad * (180 / Math.PI)) * 1.35, 0, 179);
                const AzDeg = ((Math.atan2(U, -V) * 180) / Math.PI + 360) % 360;
                Val = EvaluateIesIntensity(Props, LoadedProfiles, AzDeg, PolarDeg);
                const Edge = Clamp(1 - Math.pow(R / 1.02, 6), 0, 1);
                Val *= Edge;
            }
            const Lum = Clamp(Math.round(Math.pow(Val, 0.72) * 255), 0, 255);
            const Idx = (y * Size + x) * 4;
            Img.data[Idx] = Lum;
            Img.data[Idx + 1] = Lum;
            Img.data[Idx + 2] = Lum;
            Img.data[Idx + 3] = 255;
        }
    }
    Ctx.putImageData(Img, 0, 0);
    return Canvas;
}

function LuxToFalseColour(Lux)
{
    // Architectural false-colour isolux palette: 0.1 -> violet, 5 -> blue, 25 -> cyan, 100 -> green, 300 -> amber, 800+ -> magenta/white
    const T = Clamp((Math.log10(Math.max(0.05, Lux)) + 1.1) / 4.2, 0, 1);
    const Stops = [
        [0.0,  [14, 14, 34]],
        [0.2,  [36, 68, 196]],
        [0.4,  [28, 184, 214]],
        [0.6,  [104, 224, 92]],
        [0.8,  [245, 202, 68]],
        [0.95, [242, 72, 130]],
        [1.0,  [255, 245, 250]]
    ];
    for (let i = 1; i < Stops.length; i++) {
        if (T <= Stops[i][0]) {
            const F = (T - Stops[i - 1][0]) / Math.max(1e-4, Stops[i][0] - Stops[i - 1][0]);
            const A = Stops[i - 1][1];
            const B = Stops[i][1];
            return [
                Math.round(A[0] + (B[0] - A[0]) * F),
                Math.round(A[1] + (B[1] - A[1]) * F),
                Math.round(A[2] + (B[2] - A[2]) * F)
            ];
        }
    }
    return [255, 245, 250];
}

export class PhotometricViewportController
{
    constructor(ContainerElement, Hooks = {})
    {
        this.Container = ContainerElement;
        this.Hooks = Hooks;
        this.Mode = 'initializing';
        this.ShadingMode = 'pbr'; // 'pbr' | 'lux' | 'goniometer' | 'homologation'
        this.ShowGizmos = true;
        this.ShowGrid = true;
        this.CurrentState = null;
        this.LoadedProfiles = {};
        this.Three = null;
        this.Renderer = null;
        this.Scene = null;
        this.Camera = null;
        this.Controls = null;
        this.DynamicLightGroup = null;
        this.GizmoGroup = null;
        this.StageMaterials = [];
        this.SunLight = null;
        this.MoonLight = null;
        this.HemiLight = null;
        this.SkyMesh = null;
        this.StarPoints = null;
        this.MoonMesh = null;
        this.SunMesh = null;
        this.FloorLuxCanvas = null;
        this.FloorLuxTexture = null;
        this.FloorMaterial = null;
        this.FloorStdMap = null;
        this.WallLuxCanvas = null;
        this.WallLuxTexture = null;
        this.WallMaterial = null;
        this.FallbackCanvas = null;
        this.FallbackCamera = { Yaw: 0.56, Pitch: 0.36, Distance: 11.8 };
        this.FrameId = null;
        this.Destroyed = false;
        this.Init();
    }

    async Init()
    {
        try {
            const { THREE, OrbitControls } = await LoadThree();
            if (this.Destroyed) return;
            this.Three = THREE;
            const W = Math.max(320, this.Container.clientWidth || 720);
            const H = Math.max(240, this.Container.clientHeight || 520);

            const Renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
            Renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            Renderer.setSize(W, H);
            Renderer.shadowMap.enabled = true;
            Renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            Renderer.toneMapping = THREE.ACESFilmicToneMapping;
            Renderer.toneMappingExposure = 1.15;
            Renderer.outputColorSpace = THREE.SRGBColorSpace;

            this.Container.innerHTML = '';
            this.Container.appendChild(Renderer.domElement);
            Renderer.domElement.style.width = '100%';
            Renderer.domElement.style.height = '100%';
            Renderer.domElement.style.display = 'block';

            const Scene = new THREE.Scene();
            Scene.background = new THREE.Color('#090b0f');

            const Camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 450);
            Camera.position.set(6.2, 4.2, 8.6);

            const Controls = new OrbitControls(Camera, Renderer.domElement);
            Controls.enableDamping = true;
            Controls.dampingFactor = 0.08;
            Controls.target.set(0, 1.0, -1.2);
            Controls.minDistance = 2.0;
            Controls.maxDistance = 42.0;
            Controls.maxPolarAngle = Math.PI * 0.49;

            this.Renderer = Renderer;
            this.Scene = Scene;
            this.Camera = Camera;
            this.Controls = Controls;

            this.BuildStageGeometry();
            this.BuildEnvironmentRig();

            this.DynamicLightGroup = new THREE.Group();
            this.GizmoGroup = new THREE.Group();
            Scene.add(this.DynamicLightGroup);
            Scene.add(this.GizmoGroup);

            this.Mode = 'webgl';
            this.Hooks.onBackendChange?.('Three.js WebGL2 ACES');
            if (this.CurrentState) this.SyncScene(this.CurrentState, this.LoadedProfiles);
            this.Resize();
            this.Animate();
        } catch (Err) {
            console.warn('WebGL photometric stage unavailable, using software 3D renderer:', Err);
            this.InitSoftwareFallback();
        }
    }

    InitSoftwareFallback()
    {
        this.Mode = 'software';
        const Canvas = document.createElement('canvas');
        Canvas.style.width = '100%';
        Canvas.style.height = '100%';
        Canvas.style.display = 'block';
        this.Container.innerHTML = '';
        this.Container.appendChild(Canvas);
        this.FallbackCanvas = Canvas;

        let Dragging = false;
        let LastX = 0;
        let LastY = 0;
        Canvas.addEventListener('pointerdown', (E) => {
            Dragging = true;
            LastX = E.clientX;
            LastY = E.clientY;
            Canvas.setPointerCapture(E.pointerId);
        });
        Canvas.addEventListener('pointermove', (E) => {
            if (!Dragging) return;
            this.FallbackCamera.Yaw -= (E.clientX - LastX) * 0.008;
            this.FallbackCamera.Pitch = Clamp(this.FallbackCamera.Pitch + (E.clientY - LastY) * 0.006, 0.08, 1.35);
            LastX = E.clientX;
            LastY = E.clientY;
            this.RenderSoftwareFrame();
        });
        Canvas.addEventListener('pointerup', () => (Dragging = false));
        Canvas.addEventListener('wheel', (E) => {
            E.preventDefault();
            this.FallbackCamera.Distance = Clamp(this.FallbackCamera.Distance + E.deltaY * 0.01, 4.5, 24);
            this.RenderSoftwareFrame();
        }, { passive: false });

        this.Hooks.onBackendChange?.('Software Photometric 3D');
        this.Resize();
        this.RenderSoftwareFrame();
    }

    BuildStageGeometry()
    {
        const THREE = this.Three;
        const Scene = this.Scene;

        // Polar floor calibration texture (concentric 1m/2m/5m/10m rings + roadway lanes)
        const FloorCanvas = document.createElement('canvas');
        FloorCanvas.width = 1024;
        FloorCanvas.height = 1024;
        const FCtx = FloorCanvas.getContext('2d');
        FCtx.fillStyle = '#1b1d22';
        FCtx.fillRect(0, 0, 1024, 1024);
        // Subtle matte concrete grain
        for (let g = 0; g < 6000; g++) {
            const X = (Math.sin(g * 19.3) * 43758.5 % 1 + 1) % 1 * 1024;
            const Y = (Math.sin(g * 43.7) * 29831.2 % 1 + 1) % 1 * 1024;
            FCtx.fillStyle = g % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
            FCtx.fillRect(X, Y, 2, 2);
        }
        // Grid lines every 1 m across 24x24 m floor
        FCtx.strokeStyle = 'rgba(255,255,255,0.06)';
        FCtx.lineWidth = 1;
        for (let i = 0; i <= 24; i++) {
            const P = (i / 24) * 1024;
            FCtx.beginPath(); FCtx.moveTo(P, 0); FCtx.lineTo(P, 1024); FCtx.stroke();
            FCtx.beginPath(); FCtx.moveTo(0, P); FCtx.lineTo(1024, P); FCtx.stroke();
        }
        // Polar rings at 1m, 2m, 5m, 10m centered at (0,0)
        [1, 2, 5, 10].forEach(Rm => {
            FCtx.strokeStyle = Rm === 5 ? 'rgba(239,244,207,0.22)' : 'rgba(255,255,255,0.12)';
            FCtx.lineWidth = Rm === 5 ? 2 : 1.2;
            FCtx.beginPath();
            FCtx.arc(512, 512, (Rm / 12) * 512, 0, Math.PI * 2);
            FCtx.stroke();
        });
        // Roadway lane markers toward homologation screen
        FCtx.strokeStyle = 'rgba(239,244,207,0.18)';
        FCtx.setLineDash([18, 16]);
        FCtx.lineWidth = 3;
        FCtx.beginPath(); FCtx.moveTo(512 - 74, 0); FCtx.lineTo(512 - 74, 1024); FCtx.stroke();
        FCtx.beginPath(); FCtx.moveTo(512 + 74, 0); FCtx.lineTo(512 + 74, 1024); FCtx.stroke();
        FCtx.setLineDash([]);

        this.FloorStdMap = new THREE.CanvasTexture(FloorCanvas);
        this.FloorStdMap.colorSpace = THREE.SRGBColorSpace;
        this.FloorStdMap.anisotropy = 4;

        this.FloorLuxCanvas = document.createElement('canvas');
        this.FloorLuxCanvas.width = 160;
        this.FloorLuxCanvas.height = 160;
        this.FloorLuxTexture = new THREE.CanvasTexture(this.FloorLuxCanvas);
        this.FloorLuxTexture.colorSpace = THREE.SRGBColorSpace;

        this.FloorMaterial = new THREE.MeshStandardMaterial({
            map: this.FloorStdMap,
            roughness: 0.78,
            metalness: 0.08
        });
        const FloorMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), this.FloorMaterial);
        FloorMesh.rotation.x = -Math.PI / 2;
        FloorMesh.receiveShadow = true;
        Scene.add(FloorMesh);

        // Homologation projection wall at Z = -5.4 m (ideal for inspecting ECE Low Beam / Spot / Area patterns!)
        const WallCanvas = document.createElement('canvas');
        WallCanvas.width = 1024;
        WallCanvas.height = 512;
        const WC = WallCanvas.getContext('2d');
        WC.fillStyle = '#c8cbd2';
        WC.fillRect(0, 0, 1024, 512);
        WC.strokeStyle = 'rgba(25,30,38,0.22)';
        WC.lineWidth = 2;
        for (let wx = 0; wx <= 10; wx++) {
            const X = (wx / 10) * 1024;
            WC.beginPath(); WC.moveTo(X, 0); WC.lineTo(X, 512); WC.stroke();
        }
        // Horizon 0 deg & -1 deg ECE cut-off rule lines
        WC.strokeStyle = 'rgba(220,72,56,0.45)';
        WC.setLineDash([10, 8]);
        WC.beginPath(); WC.moveTo(0, 340); WC.lineTo(1024, 340); WC.stroke();
        WC.strokeStyle = 'rgba(25,30,38,0.45)';
        WC.beginPath(); WC.moveTo(0, 315); WC.lineTo(1024, 315); WC.stroke();
        WC.setLineDash([]);
        this.WallStdMap = new THREE.CanvasTexture(WallCanvas);
        this.WallStdMap.colorSpace = THREE.SRGBColorSpace;

        this.WallLuxCanvas = document.createElement('canvas');
        this.WallLuxCanvas.width = 160;
        this.WallLuxCanvas.height = 80;
        this.WallLuxTexture = new THREE.CanvasTexture(this.WallLuxCanvas);
        this.WallLuxTexture.colorSpace = THREE.SRGBColorSpace;

        this.WallMaterial = new THREE.MeshStandardMaterial({
            map: this.WallStdMap,
            roughness: 0.86,
            metalness: 0.04
        });
        const WallMesh = new THREE.Mesh(new THREE.BoxGeometry(11.0, 4.4, 0.24), this.WallMaterial);
        WallMesh.position.set(0, 2.2, -5.4);
        WallMesh.receiveShadow = true;
        WallMesh.castShadow = true;
        Scene.add(WallMesh);

        // Architectural calibration plinth, matte reference sphere, chrome specular probe, and architectural baffles
        const PlinthMat = new THREE.MeshStandardMaterial({ color: 0x3b3e45, roughness: 0.62, metalness: 0.14 });
        const MatteMat = new THREE.MeshStandardMaterial({ color: 0xd9dade, roughness: 0.85, metalness: 0.0 });
        const ChromeMat = new THREE.MeshStandardMaterial({ color: 0xeaf0f7, roughness: 0.08, metalness: 0.94 });
        const DarkPedestalMat = new THREE.MeshStandardMaterial({ color: 0x202227, roughness: 0.48, metalness: 0.35 });

        const Plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 1.4), PlinthMat);
        Plinth.position.set(0, 0.21, -0.6);
        Plinth.castShadow = true;
        Plinth.receiveShadow = true;
        Scene.add(Plinth);

        const MatteSphere = new THREE.Mesh(new THREE.SphereGeometry(0.56, 36, 28), MatteMat);
        MatteSphere.position.set(-0.62, 0.98, -0.6);
        MatteSphere.castShadow = true;
        MatteSphere.receiveShadow = true;
        Scene.add(MatteSphere);

        const ChromeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.56, 36, 28), ChromeMat);
        ChromeSphere.position.set(0.65, 0.98, -0.6);
        ChromeSphere.castShadow = true;
        ChromeSphere.receiveShadow = true;
        Scene.add(ChromeSphere);

        // Headlamp calibration tripod/stand at (-1.15, 0..0.88, 3.6)
        const StandPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.88, 16), DarkPedestalMat);
        StandPost.position.set(-1.15, 0.44, 3.6);
        StandPost.castShadow = true;
        Scene.add(StandPost);

        // Two architectural vertical baffle pillars for oblique shadow & IES wall-wash inspection
        [-3.4, 3.4].forEach((BX) => {
            const Pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), PlinthMat);
            Pillar.position.set(BX, 1.7, -2.9);
            Pillar.castShadow = true;
            Pillar.receiveShadow = true;
            Scene.add(Pillar);
        });
    }

    BuildEnvironmentRig()
    {
        const THREE = this.Three;
        const Scene = this.Scene;

        this.HemiLight = new THREE.HemisphereLight(0x6e90b8, 0x222320, 0.65);
        Scene.add(this.HemiLight);

        this.SunLight = new THREE.DirectionalLight(0xfff4de, 1.2);
        this.SunLight.castShadow = true;
        this.SunLight.shadow.mapSize.set(1024, 1024);
        this.SunLight.shadow.camera.near = 0.5;
        this.SunLight.shadow.camera.far = 45;
        const D = 9;
        this.SunLight.shadow.camera.left = -D;
        this.SunLight.shadow.camera.right = D;
        this.SunLight.shadow.camera.top = D;
        this.SunLight.shadow.camera.bottom = -D;
        this.SunLight.shadow.bias = -0.0005;
        Scene.add(this.SunLight);

        this.MoonLight = new THREE.DirectionalLight(0xa8c2e8, 0.2);
        Scene.add(this.MoonLight);

        // Sky gradient dome shader
        const SkyUniforms = {
            uZenith: { value: new THREE.Color('#203859') },
            uHorizon: { value: new THREE.Color('#6f859e') },
            uGround: { value: new THREE.Color('#131417') },
            uPower: { value: 1.0 }
        };
        const SkyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: SkyUniforms,
            vertexShader: 'varying vec3 vWorldPos; void main(){ vec4 p = modelMatrix * vec4(position,1.0); vWorldPos = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
            fragmentShader: `
                uniform vec3 uZenith, uHorizon, uGround;
                uniform float uPower;
                varying vec3 vWorldPos;
                void main() {
                    float h = normalize(vWorldPos).y;
                    vec3 col = h >= 0.0
                        ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55))
                        : mix(uHorizon * 0.45, uGround, pow(clamp(-h, 0.0, 1.0), 0.4));
                    gl_FragColor = vec4(col * uPower, 1.0);
                }
            `
        });
        this.SkyMesh = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), SkyMat);
        Scene.add(this.SkyMesh);

        // Star field buffer geometry on sky sphere
        const StarPositions = new Float32Array(300 * 3);
        const StarMagnitudes = new Float32Array(300);
        for (let i = 0; i < 300; i++) {
            const U = ((Math.sin(i * 12.9898) * 43758.5) % 1 + 1) % 1;
            const V = ((Math.sin(i * 78.233) * 29831.2) % 1 + 1) % 1;
            const Theta = U * Math.PI * 2;
            const Phi = Math.acos(Clamp(V * 0.92 + 0.06, 0.05, 0.99));
            const R = 155;
            StarPositions[i * 3] = R * Math.sin(Phi) * Math.cos(Theta);
            StarPositions[i * 3 + 1] = R * Math.cos(Phi);
            StarPositions[i * 3 + 2] = R * Math.sin(Phi) * Math.sin(Theta);
            StarMagnitudes[i] = ((Math.sin(i * 39.42) * 19283.7) % 1 + 1) % 1 * 7.8;
        }
        this.StarMagnitudes = StarMagnitudes;
        this.StarPositionsBase = StarPositions;
        const StarGeo = new THREE.BufferGeometry();
        StarGeo.setAttribute('position', new THREE.BufferAttribute(StarPositions.slice(), 3));
        const StarMat = new THREE.PointsMaterial({ color: 0xe6f0ff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.7 });
        this.StarPoints = new THREE.Points(StarGeo, StarMat);
        Scene.add(this.StarPoints);

        // Sun & Moon sky disc markers
        this.SunMesh = new THREE.Mesh(
            new THREE.SphereGeometry(2.6, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xfff3d4 })
        );
        Scene.add(this.SunMesh);

        this.MoonMesh = new THREE.Mesh(
            new THREE.SphereGeometry(2.4, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xdce4f0 })
        );
        Scene.add(this.MoonMesh);
    }

    SetShadingMode(Mode)
    {
        this.ShadingMode = Mode;
        if (this.Mode === 'webgl' && this.CurrentState) {
            this.SyncScene(this.CurrentState, this.LoadedProfiles);
        } else if (this.Mode === 'software') {
            this.RenderSoftwareFrame();
        }
    }

    SetCameraView(Preset)
    {
        if (this.Mode === 'software') {
            if (Preset === 'top') this.FallbackCamera = { Yaw: 0, Pitch: 1.32, Distance: 13.5 };
            else if (Preset === 'wall') this.FallbackCamera = { Yaw: 0, Pitch: 0.14, Distance: 9.2 };
            else if (Preset === 'roadway') this.FallbackCamera = { Yaw: 0.12, Pitch: 0.12, Distance: 7.4 };
            else this.FallbackCamera = { Yaw: 0.56, Pitch: 0.36, Distance: 11.8 };
            this.RenderSoftwareFrame();
            return;
        }
        if (!this.Camera || !this.Controls) return;
        if (Preset === 'top') {
            this.Camera.position.set(0.01, 14.2, 0.2);
            this.Controls.target.set(0, 0, -1.2);
        } else if (Preset === 'wall') {
            this.Camera.position.set(0, 2.1, 3.8);
            this.Controls.target.set(0, 1.8, -5.4);
        } else if (Preset === 'roadway') {
            this.Camera.position.set(-0.6, 1.15, 6.2);
            this.Controls.target.set(-0.2, 0.7, -5.4);
        } else {
            this.Camera.position.set(6.2, 4.2, 8.6);
            this.Controls.target.set(0, 1.0, -1.2);
        }
        this.Controls.update();
    }

    SyncScene(State, LoadedProfiles = {})
    {
        this.CurrentState = State;
        this.LoadedProfiles = LoadedProfiles;
        if (this.Mode === 'software') {
            this.RenderSoftwareFrame();
            return;
        }
        if (this.Mode !== 'webgl' || !this.Three) return;

        const THREE = this.Three;
        const { Lights, SelectedId, Env, SunState } = State;

        // Clear old dynamic lights & gizmos cleanly
        while (this.DynamicLightGroup.children.length > 0) {
            const Child = this.DynamicLightGroup.children.pop();
            if (Child.target) this.DynamicLightGroup.remove(Child.target);
            Child.geometry?.dispose?.();
            Child.material?.map?.dispose?.();
            Child.material?.dispose?.();
        }
        while (this.GizmoGroup.children.length > 0) {
            const G = this.GizmoGroup.children.pop();
            G.geometry?.dispose?.();
            G.material?.dispose?.();
        }

        // Environment: HDR Dome + Sun + Moon + Stars + Fog + Post
        const EnvDome = Env.EnvDome;
        const SkyUniforms = this.SkyMesh.material.uniforms;
        const SunEl = SunState?.ElevationDeg ?? 28;
        const DayFactor = Clamp((SunEl + 6) / 28, 0.06, 1);

        const DomMult = this.ShadingMode === 'goniometer' ? 0.14 : (EnvDome.Enabled ? EnvDome.SkylightIntensity * EnvDome.DiffuseMultiplier : 0.08);
        this.HemiLight.intensity = Clamp(0.55 * DomMult * (0.28 + 0.72 * DayFactor), 0.04, 2.2);
        this.HemiLight.color.set(EnvDome.ZenithColor);
        this.HemiLight.groundColor.set(EnvDome.GroundColor);

        SkyUniforms.uZenith.value.set(EnvDome.ZenithColor);
        SkyUniforms.uHorizon.value.set(EnvDome.HorizonColor);
        SkyUniforms.uGround.value.set(EnvDome.GroundColor);
        SkyUniforms.uPower.value = this.ShadingMode === 'goniometer' ? 0.16 : Clamp((0.18 + 0.82 * DayFactor) * EnvDome.SkylightIntensity, 0.08, 2.0);
        this.SkyMesh.visible = EnvDome.Enabled;

        // Sun light
        const SunDir = SunState?.Direction || [0.4, 0.6, 0.4];
        const SunActive = Boolean(SunState?.Enabled) && SunEl > -6 && this.ShadingMode !== 'goniometer';
        this.SunLight.visible = SunActive;
        this.SunMesh.visible = Boolean(SunState?.Enabled) && SunEl > -12;
        if (SunState) {
            this.SunLight.position.set(SunDir[0] * 18, Math.max(0.5, SunDir[1] * 18), SunDir[2] * 18);
            this.SunLight.intensity = SunActive ? Clamp((SunState.Intensity ?? 12) * 0.14 * DayFactor, 0, 4.5) : 0;
            this.SunLight.color.setRGB(...(SunState.TintRgb || [1, 0.94, 0.85]));
            this.SunMesh.position.set(SunDir[0] * 140, SunDir[1] * 140, SunDir[2] * 140);
            const DiscScale = Clamp((SunState.DiameterDeg ?? 0.53) * 1.4, 0.5, 4);
            this.SunMesh.scale.setScalar(DiscScale);
        }

        // Moon light
        const Moon = Env.Moon;
        const MoonM = SolveMoonMetrics(Moon);
        const MoonBody = MoonCatalogue[Clamp(Moon.Slot | 0, 0, MoonCatalogue.length - 1)];
        this.MoonLight.visible = Boolean(Moon.Visible) && Boolean(Moon.CastMoonlight) && Moon.ElevationDeg > -2;
        this.MoonLight.position.set(MoonM.Direction[0] * 16, Math.max(0.4, MoonM.Direction[1] * 16), MoonM.Direction[2] * 16);
        this.MoonLight.intensity = this.MoonLight.visible ? Clamp(Moon.Brightness * 0.18 * (0.2 + 0.8 * MoonM.Illumination), 0, 1.5) : 0;
        this.MoonLight.color.set(MoonBody.Tint);
        this.MoonMesh.visible = Boolean(Moon.Visible) && Moon.ElevationDeg > -6;
        this.MoonMesh.position.set(MoonM.Direction[0] * 135, MoonM.Direction[1] * 135, MoonM.Direction[2] * 135);
        this.MoonMesh.material.color.set(MoonBody.Tint);
        this.MoonMesh.scale.setScalar(Clamp(Moon.AngularDiameterDeg * 1.2, 0.4, 5));

        // Stars
        const Stars = Env.Stars;
        this.StarPoints.visible = Boolean(Stars.Visible) && DayFactor < 0.72;
        this.StarPoints.material.opacity = Clamp((1 - DayFactor) * Stars.Brightness, 0, 1);
        this.StarPoints.material.size = Clamp(Stars.PointSize * 1.5, 0.5, 4.0);
        this.StarPoints.rotation.y = (Stars.CelestialRotationDeg * Math.PI) / 180;

        // Fog
        const Fog = Env.Fog;
        this.Scene.fog = Fog.Enabled ? new THREE.FogExp2(Fog.Tint, Fog.Density) : null;

        // Post / Exposure
        const Post = Env.Post;
        this.Renderer.toneMappingExposure = Clamp(Math.pow(2, Post.ExposureEv || 0) * 1.1, 0.15, 6.0);
        this.Renderer.toneMapping = Post.Tonemap === 'Neutral'
            ? THREE.NeutralToneMapping
            : Post.Tonemap === 'Reinhard'
                ? THREE.ReinhardToneMapping
                : THREE.ACESFilmicToneMapping;

        // Render all scene lights + gizmos
        const GizmosVisible = this.ShowGizmos || this.ShadingMode === 'goniometer';
        for (const Item of Lights) {
            if (!Item.Visible) continue;
            const P = Item.Props;
            const ColArr = ResolveEmissionRgb(P);
            const Col = new THREE.Color(ColArr[0] / 255, ColArr[1] / 255, ColArr[2] / 255);
            const Pos = Array.isArray(P.pos) ? P.pos : [0, 2, 0];
            const Rot = Array.isArray(P.rot) ? P.rot : [0, 0, 0];
            const Selected = Item.Id === SelectedId;

            if (Item.Type === 'pointlight' || Item.Type === 'tubelight') {
                const Int = Item.Type === 'tubelight' ? (Number(P.lumens ?? 1800) / 160) : Number(P.intensity ?? 14);
                const PL = new THREE.PointLight(Col, Int * 0.48, Number(P.distance ?? 25), Number(P.decay ?? 1.6));
                PL.position.set(Pos[0], Pos[1], Pos[2]);
                PL.castShadow = Boolean(P.shadows);
                this.DynamicLightGroup.add(PL);

                if (Item.Type === 'tubelight') {
                    const Len = Clamp(Number(P.length ?? 1.8), 0.2, 10);
                    const Rad = Clamp(Number(P.radius ?? 0.04), 0.015, 0.35);
                    const Tube = new THREE.Mesh(
                        new THREE.CylinderGeometry(Rad, Rad, Len, 12),
                        new THREE.MeshBasicMaterial({ color: Col })
                    );
                    Tube.position.set(Pos[0], Pos[1], Pos[2]);
                    Tube.rotation.set(0, (Rot[1] * Math.PI) / 180, Math.PI / 2);
                    this.GizmoGroup.add(Tube);
                } else if (GizmosVisible || P.gizmoGlow) {
                    const Core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: Col }));
                    Core.position.set(Pos[0], Pos[1], Pos[2]);
                    this.GizmoGroup.add(Core);
                    const Ring = new THREE.Mesh(
                        new THREE.SphereGeometry(Selected ? 0.42 : 0.28, 16, 12),
                        new THREE.MeshBasicMaterial({ color: Col, wireframe: true, transparent: true, opacity: Selected ? 0.55 : 0.22 })
                    );
                    Ring.position.set(Pos[0], Pos[1], Pos[2]);
                    this.GizmoGroup.add(Ring);
                }
            } else if (Item.Type === 'spotlight' || Item.Type === 'ieslight' || Item.Type === 'ledlight') {
                const IsIes = Item.Type === 'ieslight';
                const Flux = IsIes
                    ? (Number(P.lumens ?? 1650) * Number(P.multiplier ?? 1)) / 24
                    : Item.Type === 'ledlight'
                        ? ComputeFlux('ledlight', P) / 36
                        : Number(P.intensity ?? 60);
                const HalfConeDeg = IsIes ? Number(P.cone ?? 58) * 0.5 : Item.Type === 'ledlight' ? Number(P.angle ?? 110) * 0.42 : Number(P.angle ?? 30);
                const Pen = IsIes ? 0.55 : Item.Type === 'ledlight' ? 0.72 : Number(P.penumbra ?? 0.42);
                const Range = Number(P.range ?? P.distance ?? 40);

                const Spot = new THREE.SpotLight(Col, Flux * 0.65, Range, Clamp((HalfConeDeg * Math.PI) / 180, 0.05, 1.38), Pen, 1.4);
                Spot.position.set(Pos[0], Pos[1], Pos[2]);
                Spot.castShadow = Boolean(P.shadows);
                Spot.shadow.mapSize.set(1024, 1024);
                Spot.shadow.bias = -0.0004;

                if (IsIes) {
                    const MapCanvas = BuildIesProjectionCanvas(P, LoadedProfiles);
                    const Tex = new THREE.CanvasTexture(MapCanvas);
                    Tex.colorSpace = THREE.SRGBColorSpace;
                    Spot.map = Tex;
                }

                // Aim target derived from target property or euler rot
                const TargetPt = Array.isArray(P.target)
                    ? new THREE.Vector3(P.target[0], P.target[1], P.target[2])
                    : new THREE.Vector3(
                        Pos[0] + Math.sin((Rot[1] * Math.PI) / 180) * 5,
                        Math.max(-2, Pos[1] + Math.sin((Rot[0] * Math.PI) / 180) * 5 - 3),
                        Pos[2] - Math.cos((Rot[1] * Math.PI) / 180) * 5
                    );
                if (IsIes && Number(P.cutoff)) {
                    TargetPt.y += Math.tan((Number(P.cutoff) * Math.PI) / 180) * Pos.reduce((a, b) => Math.max(a, Math.abs(b)), 3);
                }
                Spot.target.position.copy(TargetPt);
                this.DynamicLightGroup.add(Spot.target);
                this.DynamicLightGroup.add(Spot);

                if (GizmosVisible && (Selected || P.showCone !== false || P.showDistribution !== false)) {
                    const Bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: Col }));
                    Bulb.position.copy(Spot.position);
                    this.GizmoGroup.add(Bulb);

                    const Dir = new THREE.Vector3().subVectors(TargetPt, Spot.position);
                    const Dist = Math.max(1.2, Math.min(8.0, Dir.length()));
                    Dir.normalize();
                    const ConeR = Math.tan(Clamp((HalfConeDeg * Math.PI) / 180, 0.08, 1.2)) * Dist;
                    const ConeGeo = new THREE.ConeGeometry(ConeR, Dist, 20, 1, true);
                    ConeGeo.translate(0, -Dist * 0.5, 0);
                    ConeGeo.rotateX(Math.PI / 2);
                    const ConeMat = new THREE.MeshBasicMaterial({
                        color: Col,
                        wireframe: !Selected,
                        transparent: true,
                        opacity: Selected ? 0.14 : 0.09,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    const ConeMesh = new THREE.Mesh(ConeGeo, ConeMat);
                    ConeMesh.position.copy(Spot.position);
                    ConeMesh.lookAt(TargetPt);
                    this.GizmoGroup.add(ConeMesh);

                    // Target aim line
                    const LineGeo = new THREE.BufferGeometry().setFromPoints([Spot.position.clone(), TargetPt.clone()]);
                    const Line = new THREE.Line(
                        LineGeo,
                        new THREE.LineBasicMaterial({ color: Col, transparent: true, opacity: Selected ? 0.72 : 0.25 })
                    );
                    this.GizmoGroup.add(Line);
                }
            } else if (Item.Type === 'arealight') {
                const W = Clamp(Number(P.width ?? 2), 0.2, 12);
                const H_ = Clamp(Number(P.height ?? 1), 0.2, 12);
                const Flux = Number(P.lumens ?? 2400) / 55;
                const AreaSpot = new THREE.SpotLight(Col, Flux, 28, Clamp(((Number(P.spread ?? 120) * 0.5) * Math.PI) / 180, 0.2, 1.42), 0.85, 1.2);
                AreaSpot.position.set(Pos[0], Pos[1], Pos[2]);
                const TargetPt = Array.isArray(P.target) ? new THREE.Vector3(...P.target) : new THREE.Vector3(0, 0.6, 0);
                AreaSpot.target.position.copy(TargetPt);
                this.DynamicLightGroup.add(AreaSpot.target);
                this.DynamicLightGroup.add(AreaSpot);

                const PanelGeo = P.aperture === 'Disk' ? new THREE.CircleGeometry(W * 0.5, 24) : new THREE.PlaneGeometry(W, H_);
                const Panel = new THREE.Mesh(
                    PanelGeo,
                    new THREE.MeshBasicMaterial({ color: Col, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
                );
                Panel.position.set(Pos[0], Pos[1], Pos[2]);
                Panel.lookAt(TargetPt);
                this.GizmoGroup.add(Panel);
            } else if (Item.Type === 'ledstrip') {
                const Len = Clamp(Number(P.length ?? 3.6), 0.2, 12);
                const Flux = ComputeFlux('ledstrip', P) / 220;
                const Taps = 3;
                for (let t = 0; t < Taps; t++) {
                    const F = ((t + 0.5) / Taps - 0.5) * Len;
                    const Tap = new THREE.PointLight(Col, Flux / Taps, 10, 1.8);
                    Tap.position.set(Pos[0] + F, Pos[1] + 0.1, Pos[2]);
                    this.DynamicLightGroup.add(Tap);
                }
                const StripMesh = new THREE.Mesh(
                    new THREE.BoxGeometry(Len, 0.04, 0.05),
                    new THREE.MeshBasicMaterial({ color: Col })
                );
                StripMesh.position.set(Pos[0], Pos[1], Pos[2]);
                StripMesh.rotation.y = (Rot[1] * Math.PI) / 180;
                this.GizmoGroup.add(StripMesh);
            }
        }

        // Update Floor/Wall False-Colour Lux Heatmap if ShadingMode === 'lux'
        if (this.ShadingMode === 'lux') {
            this.UpdateLuxHeatmapTextures(State, LoadedProfiles);
            this.FloorMaterial.map = this.FloorLuxTexture;
            this.WallMaterial.map = this.WallLuxTexture;
        } else {
            this.FloorMaterial.map = this.FloorStdMap;
            this.WallMaterial.map = this.WallStdMap;
        }
        this.FloorMaterial.needsUpdate = true;
        this.WallMaterial.needsUpdate = true;
    }

    SampleStagePointLux(WX, WY, WZ, State, LoadedProfiles)
    {
        let TotalLux = State.Env.EnvDome.Enabled ? 0.8 * State.Env.EnvDome.SkylightIntensity : 0.05;
        for (const Item of State.Lights) {
            if (!Item.Visible) continue;
            const P = Item.Props;
            const Pos = Array.isArray(P.pos) ? P.pos : [0, 2, 0];
            const DX = WX - Pos[0];
            const DY = WY - Pos[1];
            const DZ = WZ - Pos[2];
            const DistSq = Math.max(0.25, DX * DX + DY * DY + DZ * DZ);
            const Dist = Math.sqrt(DistSq);

            if (Item.Type === 'pointlight' || Item.Type === 'tubelight') {
                const Reach = Number(P.distance ?? 25);
                if (Dist > Reach) continue;
                const Base = Item.Type === 'tubelight' ? Number(P.lumens ?? 1800) * 0.14 : Number(P.intensity ?? 14);
                TotalLux += (Base * 4.5) / Math.pow(Dist, Number(P.decay ?? 2));
            } else if (Item.Type === 'ledstrip') {
                TotalLux += (ComputeFlux('ledstrip', P) * 0.04) / DistSq;
            } else {
                const Target = Array.isArray(P.target) ? P.target : [Pos[0], 0, Pos[2] - 4];
                const TX = Target[0] - Pos[0];
                const TY = Target[1] - Pos[1];
                const TZ = Target[2] - Pos[2];
                const TLen = Math.max(0.01, Math.hypot(TX, TY, TZ));
                const Cos = Clamp((DX * TX + DY * TY + DZ * TZ) / (Dist * TLen), -1, 1);
                if (Cos <= 0.05) continue;
                const AngleDeg = (Math.acos(Cos) * 180) / Math.PI;
                if (Item.Type === 'ieslight') {
                    const HalfCone = Number(P.cone ?? 58) * 0.55;
                    if (AngleDeg > HalfCone * 1.45) continue;
                    const AzDeg = ((Math.atan2(DX, -DY) * 180) / Math.PI + 360) % 360;
                    const IesVal = EvaluateIesIntensity(P, LoadedProfiles, AzDeg, AngleDeg * (90 / Math.max(10, HalfCone)));
                    TotalLux += (Number(P.lumens ?? 1650) * Number(P.multiplier ?? 1) * 0.18 * IesVal) / DistSq;
                } else {
                    const Cone = Item.Type === 'spotlight' ? Number(P.angle ?? 30) : Item.Type === 'ledlight' ? Number(P.angle ?? 110) * 0.5 : Number(P.spread ?? 120) * 0.5;
                    if (AngleDeg > Cone) continue;
                    const Fall = Math.pow(Clamp(1 - AngleDeg / Math.max(2, Cone), 0, 1), 1.4);
                    const Gain = Item.Type === 'spotlight' ? Number(P.intensity ?? 60) * 3.8 : ComputeFlux(Item.Type, P) * 0.16;
                    TotalLux += (Gain * Fall) / DistSq;
                }
            }
        }
        return TotalLux;
    }

    UpdateLuxHeatmapTextures(State, LoadedProfiles)
    {
        const FCtx = this.FloorLuxCanvas.getContext('2d');
        const FW = 160;
        const FImg = FCtx.createImageData(FW, FW);
        for (let y = 0; y < FW; y++) {
            const WZ = ((y / (FW - 1)) - 0.5) * 24;
            for (let x = 0; x < FW; x++) {
                const WX = ((x / (FW - 1)) - 0.5) * 24;
                const Lux = this.SampleStagePointLux(WX, 0.02, WZ, State, LoadedProfiles);
                const C = LuxToFalseColour(Lux);
                const Idx = (y * FW + x) * 4;
                FImg.data[Idx] = C[0];
                FImg.data[Idx + 1] = C[1];
                FImg.data[Idx + 2] = C[2];
                FImg.data[Idx + 3] = 255;
            }
        }
        FCtx.putImageData(FImg, 0, 0);
        this.FloorLuxTexture.needsUpdate = true;

        const WCtx = this.WallLuxCanvas.getContext('2d');
        const WW = 160;
        const WH = 80;
        const WImg = WCtx.createImageData(WW, WH);
        for (let y = 0; y < WH; y++) {
            const WY = (1 - y / (WH - 1)) * 4.4;
            for (let x = 0; x < WW; x++) {
                const WX = ((x / (WW - 1)) - 0.5) * 11.0;
                const Lux = this.SampleStagePointLux(WX, WY, -5.25, State, LoadedProfiles);
                const C = LuxToFalseColour(Lux);
                const Idx = (y * WW + x) * 4;
                WImg.data[Idx] = C[0];
                WImg.data[Idx + 1] = C[1];
                WImg.data[Idx + 2] = C[2];
                WImg.data[Idx + 3] = 255;
            }
        }
        WCtx.putImageData(WImg, 0, 0);
        this.WallLuxTexture.needsUpdate = true;
    }

    RenderSoftwareFrame()
    {
        if (this.Mode !== 'software' || !this.FallbackCanvas || !this.CurrentState) return;
        const Canvas = this.FallbackCanvas;
        const W = Math.max(320, this.Container.clientWidth || 720);
        const H = Math.max(240, this.Container.clientHeight || 520);
        if (Canvas.width !== W || Canvas.height !== H) {
            Canvas.width = W;
            Canvas.height = H;
        }
        const Ctx = Canvas.getContext('2d');
        const { Env, Lights, SelectedId } = this.CurrentState;
        const Sky = Ctx.createLinearGradient(0, 0, 0, H);
        Sky.addColorStop(0, Env.EnvDome.ZenithColor);
        Sky.addColorStop(0.45, Env.EnvDome.HorizonColor);
        Sky.addColorStop(0.48, '#14161b');
        Sky.addColorStop(1, '#090b0f');
        Ctx.fillStyle = Sky;
        Ctx.fillRect(0, 0, W, H);

        const Cam = this.FallbackCamera;
        const CY = Math.cos(Cam.Yaw);
        const SY = Math.sin(Cam.Yaw);
        const CP = Math.cos(Cam.Pitch);
        const SP = Math.sin(Cam.Pitch);
        const Project = (X, Y, Z) => {
            const TX = X * CY - (Z + 1.2) * SY;
            const TZ = X * SY + (Z + 1.2) * CY;
            const RX = TX;
            const RY = (Y - 0.8) * CP - TZ * SP;
            const RZ = (Y - 0.8) * SP + TZ * CP + Cam.Distance;
            if (RZ < 0.4) return null;
            const F = (H * 0.9) / RZ;
            return [W * 0.5 + RX * F, H * 0.5 - RY * F, RZ];
        };

        // Perspective grid floor lines
        Ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        Ctx.lineWidth = 1;
        for (let g = -6; g <= 6; g++) {
            const A = Project(g, 0, -6);
            const B = Project(g, 0, 6);
            if (A && B) { Ctx.beginPath(); Ctx.moveTo(A[0], A[1]); Ctx.lineTo(B[0], B[1]); Ctx.stroke(); }
            const C = Project(-6, 0, g);
            const D = Project(6, 0, g);
            if (C && D) { Ctx.beginPath(); Ctx.moveTo(C[0], C[1]); Ctx.lineTo(D[0], D[1]); Ctx.stroke(); }
        }

        // Light beams & badges in 3D space
        for (const Item of Lights) {
            if (!Item.Visible) continue;
            const P = Item.Props;
            const Pos = Array.isArray(P.pos) ? P.pos : [0, 2, 0];
            const SP_ = Project(Pos[0], Pos[1], Pos[2]);
            if (!SP_) continue;
            const Col = ResolveEmissionRgb(P);
            const ColStr = `rgb(${Col[0]},${Col[1]},${Col[2]})`;
            const Sel = Item.Id === SelectedId;
            if (Array.isArray(P.target)) {
                const TP = Project(P.target[0], P.target[1], P.target[2]);
                if (TP) {
                    const G = Ctx.createLinearGradient(SP_[0], SP_[1], TP[0], TP[1]);
                    G.addColorStop(0, `rgba(${Col[0]},${Col[1]},${Col[2]},0.55)`);
                    G.addColorStop(1, `rgba(${Col[0]},${Col[1]},${Col[2]},0.04)`);
                    Ctx.fillStyle = G;
                    Ctx.beginPath();
                    Ctx.moveTo(SP_[0], SP_[1]);
                    Ctx.lineTo(TP[0] - 58, TP[1]);
                    Ctx.lineTo(TP[0] + 58, TP[1]);
                    Ctx.closePath();
                    Ctx.fill();
                }
            }
            const Rad = Sel ? 22 : 15;
            const Glow = Ctx.createRadialGradient(SP_[0], SP_[1], 2, SP_[0], SP_[1], Rad * 2.5);
            Glow.addColorStop(0, ColStr);
            Glow.addColorStop(1, 'rgba(0,0,0,0)');
            Ctx.fillStyle = Glow;
            Ctx.beginPath();
            Ctx.arc(SP_[0], SP_[1], Rad * 2.5, 0, Math.PI * 2);
            Ctx.fill();
        }
    }

    Resize()
    {
        if (!this.Container) return;
        const W = Math.max(320, this.Container.clientWidth || 720);
        const H = Math.max(240, this.Container.clientHeight || 520);
        if (this.Mode === 'webgl' && this.Renderer && this.Camera) {
            this.Camera.aspect = W / H;
            this.Camera.updateProjectionMatrix();
            this.Renderer.setSize(W, H, false);
        } else if (this.Mode === 'software') {
            this.RenderSoftwareFrame();
        }
    }

    Animate()
    {
        if (this.Destroyed) return;
        this.FrameId = requestAnimationFrame(() => this.Animate());
        if (this.Controls) this.Controls.update();
        if (this.Renderer && this.Scene && this.Camera) {
            this.Renderer.render(this.Scene, this.Camera);
        }
    }

    Dispose()
    {
        this.Destroyed = true;
        if (this.FrameId) cancelAnimationFrame(this.FrameId);
        this.Controls?.dispose?.();
        this.Renderer?.dispose?.();
    }
}
