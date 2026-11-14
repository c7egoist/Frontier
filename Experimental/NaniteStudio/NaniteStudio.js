/*==========================================================================================================================================
                                                         NANITESTUDIO.JS
==========================================================================================================================================*/
/**
 * 🧩 Nanite Virtual Geometry Studio Application Coordinator
 *
 * Integrates:
 *   - Project-Zero Editor UI shell, Outliner, 3D Stage Viewport, Inspector & Performance Drawer.
 *   - Three.js WebGL rendering pipeline with OrbitControls & Free Fly modes.
 *   - Nanite continuous monotonic DAG cut solver & GPU visibility culler.
 *   - Dynamic asset catalogue & drag-and-drop Wavefront OBJ compiler.
 */

import * as THREE from './Vendor/three.esm.min.js';
import { OrbitControls } from './Vendor/orbit-controls.esm.min.js';
import { NaniteMeshCatalogue } from './Engine/NaniteMeshCatalogue.js';
import { NaniteRuntimeEngine, NaniteInstance, LOD_LEVEL_COLORS } from './Engine/NaniteRuntimeEngine.js';
import { NaniteTelemetryManager } from './Engine/NaniteTelemetry.js';

//------------------------------------------------------------------------------------------------------------------------
//                                                STUDIO APPLICATION
//------------------------------------------------------------------------------------------------------------------------

class NaniteStudioApp
{
    constructor()
    {
        this.Canvas = document.getElementById('ViewportCanvas');
        this.Catalogue = new NaniteMeshCatalogue();
        this.Telemetry = new NaniteTelemetryManager(60);

        this.CurrentPreset = 'dragon';
        this.IsMegascene = false;

        this.initThree();
        this.Runtime = new NaniteRuntimeEngine(this.Scene, this.Camera, this.Renderer);

        this.bindDOM();
        this.loadPreset('dragon');

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree()
    {
        const Container = document.getElementById('ViewportContainer');
        const Width = Container.clientWidth || window.innerWidth * 0.6;
        const Height = Container.clientHeight || window.innerHeight;

        this.Scene = new THREE.Scene();
        this.Scene.background = new THREE.Color(0x060606);

        this.Camera = new THREE.PerspectiveCamera(45, Width / Height, 0.1, 1000);
        this.Camera.position.set(0, 4.5, 14);

        this.Renderer = new THREE.WebGLRenderer({
            canvas: this.Canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.Renderer.setSize(Width, Height);
        this.Renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.Renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.Renderer.toneMappingExposure = 1.1;

        // Lighting
        this.AmbientLight = new THREE.HemisphereLight(0xffffff, 0x111111, 0.45);
        this.Scene.add(this.AmbientLight);

        this.SunLight = new THREE.DirectionalLight(0xfff6e6, 1.4);
        this.Scene.add(this.SunLight);
        this.updateSunDirection(48, 125);

        // Ground grid
        const Grid = new THREE.GridHelper(30, 30, 0x333333, 0x181818);
        Grid.position.y = -2.5;
        this.Scene.add(Grid);

        // Controls
        this.Controls = new OrbitControls(this.Camera, this.Renderer.domElement);
        this.Controls.enableDamping = true;
        this.Controls.dampingFactor = 0.08;
        this.Controls.maxPolarAngle = Math.PI * 0.52;

        window.addEventListener('resize', () => {
            const W = Container.clientWidth;
            const H = Container.clientHeight;
            this.Camera.aspect = W / H;
            this.Camera.updateProjectionMatrix();
            this.Renderer.setSize(W, H);
        });
    }

    updateSunDirection(ElevationDeg, AzimuthDeg)
    {
        const ElevRad = (ElevationDeg * Math.PI) / 180.0;
        const AzimRad = (AzimuthDeg * Math.PI) / 180.0;
        const Dist = 20.0;

        const X = Dist * Math.cos(ElevRad) * Math.sin(AzimRad);
        const Y = Dist * Math.sin(ElevRad);
        const Z = Dist * Math.cos(ElevRad) * Math.cos(AzimRad);

        this.SunLight.position.set(X, Y, Z);
    }

    loadPreset(PresetId)
    {
        this.CurrentPreset = PresetId;
        this.IsMegascene = (PresetId === 'megascene');

        this.Runtime.clearInstances();

        if (this.IsMegascene)
        {
            // 100-Instance Megascene: 10x10 grid of Corinthian Pillars
            const Pyramid = this.Catalogue.loadPreset('column', 128);
            let InstId = 0;
            const GridSize = 10;
            const Spacing = 3.8;
            const Offset = (GridSize - 1) * Spacing * 0.5;

            for (let gz = 0; gz < GridSize; ++gz)
            {
                for (let gx = 0; gx < GridSize; ++gx)
                {
                    const Tx = gx * Spacing - Offset;
                    const Tz = gz * Spacing - Offset;
                    const Instance = new NaniteInstance(
                        InstId,
                        `Pillar [${gx}, ${gz}]`,
                        Pyramid,
                        [Tx, -2.5, Tz],
                        [0, (gx * 37 + gz * 19) % 360, 0],
                        [0.45, 0.45, 0.45]
                    );
                    this.Runtime.addInstance(Instance);
                    InstId++;
                }
            }

            this.Camera.position.set(0, 12, 32);
            this.Controls.target.set(0, 0, 0);

            this.updateInspectorHero('100-Instance Megascene', '100 Corinthian Monuments · 1.4 Million Virtual Triangles');
            this.Telemetry.addLog('Instantiated 100-Instance Nanite Megascene grid (1.4M virtual tris).');
        }
        else
        {
            const Pyramid = this.Catalogue.loadPreset(PresetId, 128);
            const Instance = new NaniteInstance(0, Pyramid.Name, Pyramid, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
            this.Runtime.addInstance(Instance);

            // Re-center camera based on bounding sphere
            this.Camera.position.set(0, Pyramid.SphereRadius * 0.6, Pyramid.SphereRadius * 2.8);
            this.Controls.target.set(0, 0, 0);

            this.updateInspectorHero(Pyramid.Name, `${Pyramid.TotalSourceTriangles.toLocaleString()} Source Triangles · ${Pyramid.Clusters.length} Morton Clusters`);
            this.Telemetry.addLog(`Loaded preset "${Pyramid.Name}" (${Pyramid.TotalSourceTriangles.toLocaleString()} tris).`);
        }

        this.updateOutliner();
        this.updateDagTable();
    }

    updateInspectorHero(Title, Subtitle)
    {
        const TitleEl = document.getElementById('InspectorMeshTitle');
        const SubEl = document.getElementById('InspectorMeshSub');
        if (TitleEl) TitleEl.textContent = Title;
        if (SubEl) SubEl.textContent = Subtitle;
    }

    updateOutliner()
    {
        const OutlinerList = document.getElementById('OutlinerTreeList');
        if (!OutlinerList) return;

        OutlinerList.innerHTML = '';
        const VisibleCountEl = document.getElementById('OutlinerVisibleCount');
        const TotalCountEl = document.getElementById('OutlinerTotalCount');

        let VisCount = 0;
        const Instances = this.Runtime.Instances;

        for (const Inst of Instances)
        {
            if (Inst.Visible) VisCount++;

            const Item = document.createElement('div');
            Item.className = 'outliner-item' + (Inst.InstanceId === 0 ? ' selected' : '');

            const Left = document.createElement('div');
            Left.className = 'outliner-item-left';
            Left.innerHTML = `<span class="outliner-icon">🏺</span><span>${Inst.Name}</span>`;

            const Right = document.createElement('div');
            Right.className = 'outliner-item-right';
            Right.innerHTML = `
                <span class="outliner-badge">${NaniteTelemetryManager.FormatCount(Inst.Pyramid.TotalVirtualTriangles)} tris</span>
                <span class="outliner-eye" title="Toggle Visibility">👁</span>
            `;

            Right.querySelector('.outliner-eye').addEventListener('click', (e) => {
                e.stopPropagation();
                Inst.Visible = !Inst.Visible;
                Right.querySelector('.outliner-eye').style.opacity = Inst.Visible ? '0.9' : '0.25';
            });

            Item.addEventListener('click', () => {
                OutlinerList.querySelectorAll('.outliner-item').forEach(el => el.classList.remove('selected'));
                Item.classList.add('selected');
            });

            Item.appendChild(Left);
            Item.appendChild(Right);
            OutlinerList.appendChild(Item);

            // Limit DOM rows if megascene to maintain peak UI responsiveness
            if (Instances.length > 20 && OutlinerList.children.length >= 15)
            {
                const Overflow = document.createElement('div');
                Overflow.style.cssText = 'padding: 6px 12px; font-size: 10px; color: var(--text-muted); text-align: center;';
                Overflow.textContent = `+ ${Instances.length - 15} more instances in scene`;
                OutlinerList.appendChild(Overflow);
                break;
            }
        }

        if (VisibleCountEl) VisibleCountEl.textContent = VisCount.toString();
        if (TotalCountEl) TotalCountEl.textContent = Instances.length.toString();
    }

    updateDagTable()
    {
        const TableBody = document.getElementById('DagTableBody');
        if (!TableBody || !this.Runtime.Instances.length) return;

        TableBody.innerHTML = '';
        const Pyramid = this.Runtime.Instances[0].Pyramid;
        const Colors = ['#2ee572', '#18d5f2', '#f2be22', '#f27222', '#e52e2e'];

        for (let L = 0; L < Pyramid.Levels.length; ++L)
        {
            const ClusterIds = Pyramid.Levels[L];
            let TriSum = 0;
            let MaxSelfErr = 0;

            for (const Id of ClusterIds)
            {
                const Clust = Pyramid.Clusters[Id];
                TriSum += Clust.TriangleCount;
                if (Clust.SelfError > MaxSelfErr) MaxSelfErr = Clust.SelfError;
            }

            const Row = document.createElement('tr');
            Row.innerHTML = `
                <td><span class="dag-level-dot" style="background:${Colors[Math.min(4, L)]};"></span>LOD ${L}</td>
                <td>${ClusterIds.length}</td>
                <td>${TriSum.toLocaleString()}</td>
                <td>${MaxSelfErr === 0 ? '0.00 mm' : (MaxSelfErr * 1000).toFixed(2) + ' mm'}</td>
            `;
            TableBody.appendChild(Row);
        }
    }

    bindDOM()
    {
        // Top Notch Preset Buttons
        const BtnSingle = document.getElementById('NotchBtnSingle');
        const BtnMegascene = document.getElementById('NotchBtnMegascene');
        if (BtnSingle && BtnMegascene)
        {
            BtnSingle.addEventListener('click', () => {
                BtnSingle.classList.add('active');
                BtnMegascene.classList.remove('active');
                this.loadPreset('dragon');
            });
            BtnMegascene.addEventListener('click', () => {
                BtnMegascene.classList.add('active');
                BtnSingle.classList.remove('active');
                this.loadPreset('megascene');
            });
        }

        // Freeze Culling Toggle
        const NotchFreeze = document.getElementById('NotchBtnFreeze');
        const ToggleFreeze = document.getElementById('ToggleFreeze');
        const HandleFreeze = () => {
            const NewState = !this.Runtime.Settings.FreezeCulling;
            this.Runtime.setFreezeCulling(NewState);
            if (NotchFreeze) NotchFreeze.classList.toggle('active-freeze', NewState);
            if (ToggleFreeze) ToggleFreeze.classList.toggle('active', NewState);
            this.Telemetry.addLog(`Freeze Culling & LOD Cut: ${NewState ? 'FROZEN' : 'LIVE'}`);
        };
        if (NotchFreeze) NotchFreeze.addEventListener('click', HandleFreeze);
        if (ToggleFreeze) ToggleFreeze.addEventListener('click', HandleFreeze);

        // Wireframe Toggle
        const NotchWire = document.getElementById('NotchBtnWire');
        const ToggleWire = document.getElementById('ToggleWireframe');
        const WireOpacityRow = document.getElementById('WireOpacityRow');
        const HandleWire = () => {
            const NewState = !this.Runtime.Settings.WireframeOverlay;
            this.Runtime.Settings.WireframeOverlay = NewState;
            if (NotchWire) NotchWire.classList.toggle('active', NewState);
            if (ToggleWire) ToggleWire.classList.toggle('active', NewState);
            if (WireOpacityRow) WireOpacityRow.style.display = NewState ? 'flex' : 'none';
        };
        if (NotchWire) NotchWire.addEventListener('click', HandleWire);
        if (ToggleWire) ToggleWire.addEventListener('click', HandleWire);

        // Reset Camera
        const BtnResetCam = document.getElementById('NotchBtnResetCam');
        if (BtnResetCam)
        {
            BtnResetCam.addEventListener('click', () => {
                if (this.IsMegascene)
                {
                    this.Camera.position.set(0, 12, 32);
                    this.Controls.target.set(0, 0, 0);
                }
                else if (this.Runtime.Instances.length)
                {
                    const R = this.Runtime.Instances[0].Pyramid.SphereRadius;
                    this.Camera.position.set(0, R * 0.6, R * 2.8);
                    this.Controls.target.set(0, 0, 0);
                }
            });
        }

        // Shading Mode HUD Pills
        const ShadingGroup = document.getElementById('ShadingModeGroup');
        if (ShadingGroup)
        {
            ShadingGroup.querySelectorAll('.hud-pill').forEach(btn => {
                btn.addEventListener('click', () => {
                    ShadingGroup.querySelectorAll('.hud-pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.Runtime.Settings.ShadingMode = btn.dataset.mode;
                    this.Telemetry.addLog(`Switched view mode to "${btn.textContent}".`);
                });
            });
        }

        // Sliders & Controls
        const SliderPixelError = document.getElementById('SliderPixelError');
        const ValPixelError = document.getElementById('ValPixelError');
        if (SliderPixelError && ValPixelError)
        {
            SliderPixelError.addEventListener('input', (e) => {
                const Val = parseFloat(e.target.value);
                this.Runtime.Settings.MaxAllowedPixelError = Val;
                ValPixelError.textContent = Val.toFixed(2) + ' px';
            });
        }

        const SliderLodBias = document.getElementById('SliderLodBias');
        const ValLodBias = document.getElementById('ValLodBias');
        if (SliderLodBias && ValLodBias)
        {
            SliderLodBias.addEventListener('input', (e) => {
                const Val = parseFloat(e.target.value);
                this.Runtime.Settings.LODBias = Val;
                ValLodBias.textContent = (Val >= 0 ? '+' : '') + Val.toFixed(1);
            });
        }

        const SliderWireOpacity = document.getElementById('SliderWireOpacity');
        const ValWireOpacity = document.getElementById('ValWireOpacity');
        if (SliderWireOpacity && ValWireOpacity)
        {
            SliderWireOpacity.addEventListener('input', (e) => {
                const Val = parseFloat(e.target.value);
                this.Runtime.Settings.WireframeOpacity = Val;
                ValWireOpacity.textContent = Val.toFixed(2);
            });
        }

        // Culling Toggles
        const ToggleFrustum = document.getElementById('ToggleFrustum');
        if (ToggleFrustum)
        {
            ToggleFrustum.addEventListener('click', () => {
                this.Runtime.Settings.EnableFrustumCulling = !this.Runtime.Settings.EnableFrustumCulling;
                ToggleFrustum.classList.toggle('active', this.Runtime.Settings.EnableFrustumCulling);
            });
        }

        const ToggleNormalCone = document.getElementById('ToggleNormalCone');
        if (ToggleNormalCone)
        {
            ToggleNormalCone.addEventListener('click', () => {
                this.Runtime.Settings.EnableNormalConeCulling = !this.Runtime.Settings.EnableNormalConeCulling;
                ToggleNormalCone.classList.toggle('active', this.Runtime.Settings.EnableNormalConeCulling);
            });
        }

        const ToggleSpheres = document.getElementById('ToggleSpheres');
        if (ToggleSpheres)
        {
            ToggleSpheres.addEventListener('click', () => {
                this.Runtime.Settings.ShowBoundingSpheres = !this.Runtime.Settings.ShowBoundingSpheres;
                ToggleSpheres.classList.toggle('active', this.Runtime.Settings.ShowBoundingSpheres);
            });
        }

        // Presets Grid
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const Preset = btn.dataset.preset;
                if (Preset === 'megascene')
                {
                    if (BtnMegascene) BtnMegascene.click();
                }
                else
                {
                    if (BtnSingle) BtnSingle.classList.add('active');
                    if (BtnMegascene) BtnMegascene.classList.remove('active');
                    this.loadPreset(Preset);
                }
            });
        });

        // Wavefront OBJ Intake
        const ObjInput = document.getElementById('ObjFileInput');
        const BtnDropObj = document.getElementById('BtnDropObj');
        if (BtnDropObj && ObjInput)
        {
            BtnDropObj.addEventListener('click', () => ObjInput.click());
            ObjInput.addEventListener('change', (e) => {
                const File = e.target.files[0];
                if (!File) return;

                const Reader = new FileReader();
                Reader.onload = (evt) => {
                    const Text = evt.target.result;
                    const Pyramid = this.Catalogue.loadOBJ(File.name, Text, 128);
                    this.Runtime.clearInstances();
                    const Instance = new NaniteInstance(0, Pyramid.Name, Pyramid);
                    this.Runtime.addInstance(Instance);

                    const R = Pyramid.SphereRadius;
                    this.Camera.position.set(0, R * 0.6, R * 2.8);
                    this.Controls.target.set(0, 0, 0);

                    this.updateInspectorHero(Pyramid.Name, `Custom OBJ · ${Pyramid.TotalSourceTriangles.toLocaleString()} Triangles`);
                    this.updateOutliner();
                    this.updateDagTable();
                    this.Telemetry.addLog(`Compiled custom OBJ "${File.name}" into Nanite Cluster Pyramid.`);
                };
                Reader.readAsText(File);
            });
        }

        // Material Sliders
        const SliderRoughness = document.getElementById('SliderRoughness');
        const ValRoughness = document.getElementById('ValRoughness');
        if (SliderRoughness && ValRoughness)
        {
            SliderRoughness.addEventListener('input', (e) => {
                this.Runtime.Settings.PbrRoughness = parseFloat(e.target.value);
                ValRoughness.textContent = e.target.value;
            });
        }

        const SliderMetalness = document.getElementById('SliderMetalness');
        const ValMetalness = document.getElementById('ValMetalness');
        if (SliderMetalness && ValMetalness)
        {
            SliderMetalness.addEventListener('input', (e) => {
                this.Runtime.Settings.PbrMetalness = parseFloat(e.target.value);
                ValMetalness.textContent = e.target.value;
            });
        }

        const SliderSunElev = document.getElementById('SliderSunElevation');
        const ValSunElev = document.getElementById('ValSunElevation');
        const SliderSunAzim = document.getElementById('SliderSunAzimuth');
        const ValSunAzim = document.getElementById('ValSunAzimuth');

        const UpdateSun = () => {
            const Elev = parseFloat(SliderSunElev.value);
            const Azim = parseFloat(SliderSunAzim.value);
            if (ValSunElev) ValSunElev.textContent = Elev + '°';
            if (ValSunAzim) ValSunAzim.textContent = Azim + '°';
            this.updateSunDirection(Elev, Azim);
        };
        if (SliderSunElev) SliderSunElev.addEventListener('input', UpdateSun);
        if (SliderSunAzim) SliderSunAzim.addEventListener('input', UpdateSun);

        // Bottom Drawer Handle
        const DrawerHandle = document.getElementById('DrawerHandle');
        const BottomDrawer = document.getElementById('BottomDrawer');
        if (DrawerHandle && BottomDrawer)
        {
            DrawerHandle.addEventListener('click', () => {
                BottomDrawer.classList.toggle('collapsed');
            });
        }
    }

    animate()
    {
        requestAnimationFrame(this.animate);

        this.Controls.update();

        // Evaluate continuous Nanite LOD Cut & Culling
        this.Runtime.evaluateLODCut();

        // Render WebGL scene
        this.Renderer.render(this.Scene, this.Camera);

        // Record telemetry
        const Tel = this.Runtime.Telemetry;
        this.Telemetry.recordSample(Tel.FrameTimeMs, Tel.ActiveTriangles);

        // Update charts in bottom drawer
        const HistCanvas = document.getElementById('HistogramCanvas');
        const FrameCanvas = document.getElementById('FrameTimeCanvas');
        this.Telemetry.drawLODHistogram(HistCanvas, Tel.LODLevelCounts);
        this.Telemetry.drawFrameTimeGraph(FrameCanvas);

        // Update Readouts & Badges
        this.updateHUDReadouts(Tel);
    }

    updateHUDReadouts(Tel)
    {
        // Top Notch FPS badge
        const FpsBadge = document.getElementById('NotchFpsBadge');
        if (FpsBadge) FpsBadge.textContent = Tel.FPS + ' FPS';

        // Floating Bottom HUD
        const HudVirt = document.getElementById('HudVirtualTris');
        const HudAct = document.getElementById('HudActiveTris');
        const HudRed = document.getElementById('HudReductionPct');
        const HudClust = document.getElementById('HudActiveClusters');
        const HudErr = document.getElementById('HudMaxError');

        if (HudVirt) HudVirt.textContent = NaniteTelemetryManager.FormatCount(Tel.TotalVirtualTriangles);
        if (HudAct) HudAct.textContent = NaniteTelemetryManager.FormatCount(Tel.ActiveTriangles);
        if (HudRed) HudRed.textContent = `-${Tel.ReductionPercentage.toFixed(1)}%`;
        if (HudClust) HudClust.textContent = Tel.ActiveClusters.toString();
        if (HudErr) HudErr.textContent = Tel.MaxProjectedPixelError.toFixed(2) + ' px';

        // 2x2 Metric Cards
        const MetricTris = document.getElementById('MetricTriangles');
        const MetricRed = document.getElementById('MetricReduction');
        const MetricClust = document.getElementById('MetricClusters');
        const MetricClustPct = document.getElementById('MetricClusterPct');
        const MetricErr = document.getElementById('MetricError');
        const MetricMs = document.getElementById('MetricFrameTime');
        const MetricFps = document.getElementById('MetricFps');

        if (MetricTris) MetricTris.textContent = `${NaniteTelemetryManager.FormatCount(Tel.TotalVirtualTriangles)} → ${NaniteTelemetryManager.FormatCount(Tel.ActiveTriangles)}`;
        if (MetricRed) MetricRed.textContent = `-${Tel.ReductionPercentage.toFixed(1)}% culled`;

        if (MetricClust) MetricClust.textContent = `${Tel.ActiveClusters} / ${Tel.TotalClusters}`;
        const ClustPct = Tel.TotalClusters > 0 ? (Tel.ActiveClusters / Tel.TotalClusters) * 100 : 0;
        if (MetricClustPct) MetricClustPct.textContent = `${ClustPct.toFixed(1)}% selected`;

        if (MetricErr) MetricErr.textContent = `${Tel.MaxProjectedPixelError.toFixed(2)} px`;
        if (MetricMs) MetricMs.textContent = `${Tel.FrameTimeMs.toFixed(1)} ms`;
        if (MetricFps) MetricFps.textContent = `${Tel.FPS} FPS solid`;

        // Culling Breakdown Card
        const StatFrustum = document.getElementById('StatFrustumCulled');
        const StatNormal = document.getElementById('StatNormalConeCulled');
        const StatError = document.getElementById('StatErrorCulled');
        const StatBuffer = document.getElementById('StatBufferOverhead');

        const TotalCulled = Tel.FrustumCulledClusters + Tel.NormalConeCulledClusters + Tel.ErrorCulledClusters;
        const FrustPct = TotalCulled > 0 ? (Tel.FrustumCulledClusters / TotalCulled) * 100 : 0;
        const NormPct = TotalCulled > 0 ? (Tel.NormalConeCulledClusters / TotalCulled) * 100 : 0;

        if (StatFrustum) StatFrustum.textContent = `${Tel.FrustumCulledClusters} (${FrustPct.toFixed(1)}%)`;
        if (StatNormal) StatNormal.textContent = `${Tel.NormalConeCulledClusters} (${NormPct.toFixed(1)}%)`;
        if (StatError) StatError.textContent = `${Tel.ErrorCulledClusters}`;

        const BufferBytes = Tel.ActiveTriangles * 3 * 4; // Uint32 indices
        if (StatBuffer) StatBuffer.textContent = (BufferBytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
}

// Bootstrap on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    new NaniteStudioApp();
});
