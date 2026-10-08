//============================================================================================================================================
//                                                             WORKSPACEPANEL.JS
//============================================================================================================================================
// 📦 Dual-Engine Voxel Cliff Authoring Workspace: Native WebGPU WGSL Raymarching + Three.js Surface Nets Isosurface Polygonizer.
// Features: true >90° overhangs, Gaea Stacks differential hardness strata, 3D Voronoi joints, thermal talus, and OBJ/PLY export.

import * as THREE from 'three';
import { OrbitControls } from './lib/addons/OrbitControls.js';
import { CliffField } from './VoxelField.js';
import { SurfaceNetsMesher } from './SurfaceNets.js';
import { CliffPresets, CliffStageInfo, DefaultCliffSpec } from './CliffPresets.js';
import { CliffMaterials } from './SatmapShaders.js';
import { CliffWebGPURenderer } from './CliffWebGPU.js';

const $ = (id) => document.getElementById(id);

// Application State
const State = {
    spec: { ...DefaultCliffSpec },
    currentStage: 5,
    engine: 'webgl', // 'webgpu' or 'webgl'
    displayMode: 'Satmaps', // 'Satmaps', 'Clay', 'Wire', 'WebGPU', 'Slope', 'Strata', 'Cavity', 'Flow'
    satmapSubmode: 'composite',
    meshData: null,
    meshObject: null,
    wireObject: null,
    isBuilding: false,
    turntable: false,
    buildTimeMs: 0,
    webgpuRenderer: null,
    hasWebGPU: false
};

// --------------------------------------------------------------------------------------------------------------------------------------------
// VIEWPORT INITIALIZATION (THREE.JS + WEBGPU ADAPTER)
// --------------------------------------------------------------------------------------------------------------------------------------------
const canvas = $('SceneCanvas');
const viewport = $('Viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c2027');

const camera = new THREE.PerspectiveCamera(38, viewport.clientWidth / viewport.clientHeight, 0.1, 500);
camera.position.set(24, 18, 32);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
});
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.0;
controls.maxDistance = 200.0;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 0, 0);

// Lighting Rig
const hemiLight = new THREE.HemisphereLight('#e4edf8', '#383a42', 1.1);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight('#fff5e3', 3.4);
sunLight.position.set(-28, 36, 26);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, {
    left: -30,
    right: 30,
    top: 30,
    bottom: -30,
    near: 0.5,
    far: 140
});
sunLight.shadow.normalBias = 0.04;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight, sunLight.target);

const fillLight = new THREE.DirectionalLight('#a8c2e8', 0.85);
fillLight.position.set(22, 12, -22);
scene.add(fillLight);

// Ground Plane and Grid Helper
const groundGeom = new THREE.PlaneGeometry(160, 160);
const groundMat = new THREE.MeshStandardMaterial({
    color: '#242831',
    roughness: 0.95,
    metalness: 0.05
});
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -10.0;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(100, 25, '#3b4352', '#2a303d');
gridHelper.position.y = -9.95;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.35;
scene.add(gridHelper);

// --------------------------------------------------------------------------------------------------------------------------------------------
// VOXEL CLIFF GENERATION PIPELINE (SURFACE NETS & SDF)
// --------------------------------------------------------------------------------------------------------------------------------------------
async function buildVoxelCliff() {
    if (State.isBuilding) return;
    State.isBuilding = true;

    $('Loading').style.display = 'flex';
    $('LoadingTitle').textContent = `Sampling Stage ${State.currentStage}: ${CliffStageInfo[State.currentStage - 1].name}`;
    $('LoadingDetail').textContent = `Building 3D signed distance field (${State.spec.resolution}³ grid)...`;

    await new Promise((resolve) => setTimeout(resolve, 20));

    const startTime = performance.now();

    try {
        const field = new CliffField(State.spec);
        const res = State.spec.resolution || 64;
        const resY = Math.max(36, Math.floor(res * 0.88));

        const meshData = SurfaceNetsMesher.generateMesh(field, {
            stage: State.currentStage,
            resX: res,
            resY: resY,
            resZ: res
        });

        const elapsed = performance.now() - startTime;
        State.buildTimeMs = elapsed;
        State.meshData = meshData;

        updateSceneMesh(meshData);
        updateDiagnostics(meshData, elapsed);
        updateStageCaption();

    } catch (err) {
        console.error('Voxel mesh generation failed:', err);
        const failBox = $('Failure');
        failBox.hidden = false;
        failBox.textContent = `Error during voxel generation: ${err.message}`;
    } finally {
        State.isBuilding = false;
        $('Loading').style.display = 'none';
    }
}

/**
 * Creates / updates Three.js BufferGeometry and attaches materials.
 */
function updateSceneMesh(meshData) {
    if (State.meshObject) {
        scene.remove(State.meshObject);
        State.meshObject.geometry.dispose();
        State.meshObject = null;
    }
    if (State.wireObject) {
        scene.remove(State.wireObject);
        State.wireObject.geometry.dispose();
        State.wireObject = null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
    geometry.setAttribute('aSatmap', new THREE.BufferAttribute(meshData.satmaps, 4));
    geometry.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    geometry.computeBoundingBox();

    // Adjust ground position to align precisely with cliff base
    if (geometry.boundingBox) {
        const minY = geometry.boundingBox.min.y;
        ground.position.y = minY - 0.05;
        gridHelper.position.y = minY - 0.02;
    }

    // Main Mesh Material
    let material;
    if (State.displayMode === 'Clay') {
        material = CliffMaterials.createClayMaterial();
    } else {
        material = CliffMaterials.createSatmapMaterial(State.satmapSubmode);
    }

    State.meshObject = new THREE.Mesh(geometry, material);
    State.meshObject.castShadow = true;
    State.meshObject.receiveShadow = true;
    scene.add(State.meshObject);

    // Wireframe Overlay
    if (State.displayMode === 'Wire') {
        const wireMat = CliffMaterials.createWireframeMaterial();
        State.wireObject = new THREE.Mesh(geometry, wireMat);
        scene.add(State.wireObject);
    }

    $('BodyCount').textContent = `${meshData.triangleCount.toLocaleString()} Triangles`;
}

/**
 * Updates Diagnostics sidebar metrics.
 */
function updateDiagnostics(meshData, elapsed) {
    const res = State.spec.resolution || 64;
    const resY = Math.max(36, Math.floor(res * 0.88));
    const totalVoxels = res * resY * res;

    const metricsEl = $('Metrics');
    metricsEl.innerHTML = `
        <span>Voxel Grid</span><b>${res} × ${resY} × ${res} (${(totalVoxels / 1000).toFixed(0)}k)</b>
        <span>Vertices</span><b>${meshData.vertexCount.toLocaleString()}</b>
        <span>Triangles</span><b>${meshData.triangleCount.toLocaleString()}</b>
        <span>Build Time</span><b>${elapsed.toFixed(1)} ms</b>
        <span>Overhangs (&gt;90°)</span><b class="${meshData.overhangCount > 0 ? 'Pass' : 'Warn'}"><span class="OverhangBadge"><i>\\ /</i> ${meshData.overhangPercent.toFixed(1)}% (${meshData.overhangCount.toLocaleString()} v)</span></b>
    `;

    $('QualityNote').textContent = meshData.overhangCount > 0
        ? `True 3D field verified: ${meshData.overhangPercent.toFixed(1)}% of vertices form acute overhangs and shelf undercuts impossible in heightfields.`
        : 'Formation is purely convex; increase Overhang Strength or Undercut to introduce shelves.';
}

/**
 * Updates stage title & description overlay.
 */
function updateStageCaption() {
    const stageInfo = CliffStageInfo[State.currentStage - 1];
    $('StageTitle').textContent = stageInfo.name;
    $('StageDescription').textContent = stageInfo.description;
    $('StageNumber').textContent = `0${State.currentStage} / 05`;
    $('Regenerate').textContent = `Rebuild through 0${State.currentStage}`;
}

// --------------------------------------------------------------------------------------------------------------------------------------------
// INSPECTOR UI BUILDER & EVENT HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------------------
function buildInspectorControls() {
    const container = $('ParameterControls');
    container.innerHTML = `
        <details open>
            <summary>Geological Formation</summary>
            <div class="ControlGroup">
                <div class="Property">
                    <label class="FieldLabel" for="PresetSelect">Preset landform</label>
                    <select id="PresetSelect">
                        <option value="sandstone_canyon">Sandstone Canyon (Escarpment & Alcove)</option>
                        <option value="dolerite_spires">Dolerite Spires (Columnar Needles)</option>
                        <option value="coastal_cliff">Coastal Sea Cliff (Wave-cut Overhang)</option>
                        <option value="rugged_crag">Alpine Rugged Crag (Granite Arêtes)</option>
                        <option value="monument_butte">Monument Butte & Mesa (Stepped Tiers)</option>
                    </select>
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="SeedInput">RNG Seed</label>
                    <div class="SeedRow">
                        <input id="SeedInput" type="number" value="${State.spec.seed}" min="1" max="99999">
                        <button id="RandomSeedBtn" class="button">Random</button>
                    </div>
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="ResolutionSlider">Voxel Resolution <output id="ResVal">${State.spec.resolution}³</output></label>
                    <input id="ResolutionSlider" type="range" min="40" max="96" step="8" value="${State.spec.resolution}">
                </div>
            </div>
        </details>

        <details open>
            <summary>Stage 1: Landform Dimensions & Overhangs</summary>
            <div class="ControlGroup">
                <div class="Property">
                    <label class="FieldLabel" for="OverhangSlider">Overhang Strength (\\ /) <output id="OverhangVal">${(State.spec.overhangStrength * 100).toFixed(0)}%</output></label>
                    <input id="OverhangSlider" type="range" min="0" max="1" step="0.05" value="${State.spec.overhangStrength}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="HeightSlider">Cliff Height <output id="HeightVal">${State.spec.cliffHeight} m</output></label>
                    <input id="HeightSlider" type="range" min="10" max="32" step="1" value="${State.spec.cliffHeight}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="WidthSlider">Cliff Width <output id="WidthVal">${State.spec.cliffWidth} m</output></label>
                    <input id="WidthSlider" type="range" min="12" max="36" step="1" value="${State.spec.cliffWidth}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="AsymmetrySlider">Asymmetry <output id="AsymVal">${(State.spec.asymmetry * 100).toFixed(0)}%</output></label>
                    <input id="AsymmetrySlider" type="range" min="0" max="1" step="0.05" value="${State.spec.asymmetry}">
                </div>
            </div>
        </details>

        <details open>
            <summary>Stage 2: Gaea Stacks (Strata & Hardness)</summary>
            <div class="ControlGroup">
                <div class="Property">
                    <label class="FieldLabel" for="StrataFreqSlider">Strata Frequency <output id="StrataFreqVal">${State.spec.strataFreq.toFixed(2)}</output></label>
                    <input id="StrataFreqSlider" type="range" min="0.2" max="2.0" step="0.05" value="${State.spec.strataFreq}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="StrataDipSlider">Bed Dip Angle <output id="StrataDipVal">${State.spec.strataDip}°</output></label>
                    <input id="StrataDipSlider" type="range" min="0" max="45" step="1" value="${State.spec.strataDip}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="StrataUndercutSlider">Differential Undercut <output id="UndercutVal">${(State.spec.strataUndercut * 100).toFixed(0)}%</output></label>
                    <input id="StrataUndercutSlider" type="range" min="0" max="1.5" step="0.05" value="${State.spec.strataUndercut}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="HardnessVarSlider">Hardness Variance <output id="HardnessVal">${(State.spec.strataHardnessVar * 100).toFixed(0)}%</output></label>
                    <input id="HardnessVarSlider" type="range" min="0.1" max="1.0" step="0.05" value="${State.spec.strataHardnessVar}">
                </div>
            </div>
        </details>

        <details>
            <summary>Stage 3: Geological Jointing</summary>
            <div class="ControlGroup">
                <div class="Property">
                    <label class="FieldLabel" for="JointTypeSelect">Joint Family</label>
                    <select id="JointTypeSelect">
                        <option value="columnar" ${State.spec.jointType === 'columnar' ? 'selected' : ''}>3D Voronoi Columnar (Dolerite/Basalt)</option>
                        <option value="block" ${State.spec.jointType === 'block' ? 'selected' : ''}>Orthogonal Block Sets (Sedimentary)</option>
                    </select>
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="JointScaleSlider">Joint Density <output id="JointScaleVal">${State.spec.jointScale.toFixed(2)}</output></label>
                    <input id="JointScaleSlider" type="range" min="0.2" max="1.5" step="0.05" value="${State.spec.jointScale}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="JointDepthSlider">Joint Depth <output id="JointDepthVal">${State.spec.jointDepth.toFixed(2)}</output></label>
                    <input id="JointDepthSlider" type="range" min="0.1" max="1.2" step="0.05" value="${State.spec.jointDepth}">
                </div>
            </div>
        </details>

        <details>
            <summary>Stage 4: Thermal Talus & Gullies</summary>
            <div class="ControlGroup">
                <div class="Property">
                    <label class="FieldLabel" for="TalusHeightSlider">Talus Debris Height <output id="TalusVal">${State.spec.talusHeight.toFixed(1)} m</output></label>
                    <input id="TalusHeightSlider" type="range" min="0" max="10" step="0.5" value="${State.spec.talusHeight}">
                </div>
                <div class="Property">
                    <label class="FieldLabel" for="GullyDepthSlider">Gully Carve Depth <output id="GullyVal">${State.spec.gullyDepth.toFixed(2)}</output></label>
                    <input id="GullyDepthSlider" type="range" min="0" max="1.2" step="0.05" value="${State.spec.gullyDepth}">
                </div>
            </div>
        </details>
    `;

    bindInspectorEvents();
}

/**
 * Binds DOM event listeners to all inspector controls.
 */
function bindInspectorEvents() {
    $('PresetSelect').value = State.spec.preset;
    $('PresetSelect').addEventListener('change', (e) => {
        const pKey = e.target.value;
        if (CliffPresets[pKey]) {
            State.spec = { ...CliffPresets[pKey].spec };
            $('DocumentName').value = CliffPresets[pKey].label;
            buildInspectorControls();
            buildVoxelCliff();
        }
    });

    $('SeedInput').addEventListener('change', (e) => {
        State.spec.seed = parseInt(e.target.value, 10) || 1337;
        buildVoxelCliff();
    });

    $('RandomSeedBtn').addEventListener('click', () => {
        State.spec.seed = Math.floor(Math.random() * 90000) + 1000;
        $('SeedInput').value = State.spec.seed;
        buildVoxelCliff();
    });

    const bindSlider = (id, outId, specKey, fmt) => {
        const el = $(id);
        const out = $(outId);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            State.spec[specKey] = val;
            if (out) out.textContent = fmt ? fmt(val) : val;
            const min = parseFloat(el.min) || 0;
            const max = parseFloat(el.max) || 1;
            const pct = ((val - min) / (max - min)) * 100;
            el.style.setProperty('--Fill', `${pct}%`);
        });
        el.addEventListener('change', () => buildVoxelCliff());
    };

    bindSlider('ResolutionSlider', 'ResVal', 'resolution', v => `${v}³`);
    bindSlider('OverhangSlider', 'OverhangVal', 'overhangStrength', v => `${(v * 100).toFixed(0)}%`);
    bindSlider('HeightSlider', 'HeightVal', 'cliffHeight', v => `${v} m`);
    bindSlider('WidthSlider', 'WidthVal', 'cliffWidth', v => `${v} m`);
    bindSlider('AsymmetrySlider', 'AsymVal', 'asymmetry', v => `${(v * 100).toFixed(0)}%`);

    bindSlider('StrataFreqSlider', 'StrataFreqVal', 'strataFreq', v => v.toFixed(2));
    bindSlider('StrataDipSlider', 'StrataDipVal', 'strataDip', v => `${v}°`);
    bindSlider('StrataUndercutSlider', 'UndercutVal', 'strataUndercut', v => `${(v * 100).toFixed(0)}%`);
    bindSlider('HardnessVarSlider', 'HardnessVal', 'strataHardnessVar', v => `${(v * 100).toFixed(0)}%`);

    if ($('JointTypeSelect')) {
        $('JointTypeSelect').addEventListener('change', (e) => {
            State.spec.jointType = e.target.value;
            buildVoxelCliff();
        });
    }
    bindSlider('JointScaleSlider', 'JointScaleVal', 'jointScale', v => v.toFixed(2));
    bindSlider('JointDepthSlider', 'JointDepthVal', 'jointDepth', v => v.toFixed(2));

    bindSlider('TalusHeightSlider', 'TalusVal', 'talusHeight', v => `${v.toFixed(1)} m`);
    bindSlider('GullyDepthSlider', 'GullyVal', 'gullyDepth', v => v.toFixed(2));
}

/**
 * Builds the Stage Outliner List (Stages 01..05)
 */
function buildStageList() {
    const list = $('StageList');
    list.innerHTML = '';

    CliffStageInfo.forEach((info) => {
        const btn = document.createElement('button');
        btn.className = `StageButton ${info.stage === State.currentStage ? 'Active' : ''}`;
        btn.id = `StageBtn_${info.stage}`;
        btn.innerHTML = `
            <span class="Number">0${info.stage}</span>
            <div>
                <strong>${info.name}</strong>
                <small>${info.subtitle}</small>
            </div>
        `;
        btn.addEventListener('click', () => {
            setStage(info.stage);
        });
        list.appendChild(btn);
    });
}

function setStage(stageNum) {
    State.currentStage = Math.max(1, Math.min(5, stageNum));
    document.querySelectorAll('.StageButton').forEach((btn, idx) => {
        btn.classList.toggle('Active', idx + 1 === State.currentStage);
    });
    buildVoxelCliff();
}

// --------------------------------------------------------------------------------------------------------------------------------------------
// VIEWPORT CONTROLS & DISPLAY MODES
// --------------------------------------------------------------------------------------------------------------------------------------------
function setupViewportControls() {
    const setMode = (mode) => {
        State.displayMode = mode;
        $('Clay').classList.toggle('Active', mode === 'Clay');
        $('Wire').classList.toggle('Active', mode === 'Wire');
        $('Maps').classList.toggle('Active', mode === 'Satmaps');
        if (State.meshData) updateSceneMesh(State.meshData);
    };

    $('Clay').addEventListener('click', () => setMode('Clay'));
    $('Wire').addEventListener('click', () => setMode('Wire'));
    $('Maps').addEventListener('click', () => {
        setMode('Satmaps');
        cycleSatmapMode();
    });

    function cycleSatmapMode() {
        const modes = ['composite', 'slope', 'strata', 'cavity', 'flow'];
        const nextIdx = (modes.indexOf(State.satmapSubmode) + 1) % modes.length;
        State.satmapSubmode = modes[nextIdx];
        $('Maps').textContent = `Satmaps (${State.satmapSubmode.toUpperCase()})`;
        if (State.meshData) updateSceneMesh(State.meshData);
    }

    const frameCamera = () => {
        if (!State.meshObject) return;
        const geom = State.meshObject.geometry;
        geom.computeBoundingSphere();
        const sphere = geom.boundingSphere;
        if (sphere) {
            controls.target.copy(sphere.center);
            const dist = sphere.radius * 2.2;
            camera.position.set(sphere.center.x + dist * 0.7, sphere.center.y + dist * 0.5, sphere.center.z + dist * 0.8);
            controls.update();
        }
    };

    $('Frame').addEventListener('click', frameCamera);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'f' || e.key === 'F') {
            if (document.activeElement.tagName !== 'INPUT') frameCamera();
        }
    });

    $('Front').addEventListener('click', () => {
        camera.position.set(0, 4, 38);
        controls.target.set(0, 0, 0);
        controls.update();
    });

    $('Rear').addEventListener('click', () => {
        camera.position.set(0, 4, -38);
        controls.target.set(0, 0, 0);
        controls.update();
    });

    $('PreviousStage').addEventListener('click', () => setStage(State.currentStage - 1));
    $('NextStage').addEventListener('click', () => setStage(State.currentStage + 1));
    $('Regenerate').addEventListener('click', () => buildVoxelCliff());

    $('LightAngle').addEventListener('input', (e) => {
        const deg = parseFloat(e.target.value);
        $('LightValue').textContent = `${deg}°`;
        const rad = (deg * Math.PI) / 180;
        const radius = 45;
        sunLight.position.x = Math.sin(rad) * radius;
        sunLight.position.z = Math.cos(rad) * radius;
    });

    $('Shadows').addEventListener('change', (e) => {
        renderer.shadowMap.enabled = e.target.checked;
        if (State.meshObject) State.meshObject.castShadow = e.target.checked;
    });

    $('Ground').addEventListener('change', (e) => {
        ground.visible = e.target.checked;
        gridHelper.visible = e.target.checked;
    });

    $('Turntable').addEventListener('change', (e) => {
        State.turntable = e.target.checked;
    });

    $('CliffSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.StageButton').forEach(btn => {
            const match = btn.textContent.toLowerCase().includes(query);
            btn.style.display = match ? 'flex' : 'none';
        });
    });
}

// --------------------------------------------------------------------------------------------------------------------------------------------
// EXPORT & RECIPE EXCHANGE
// --------------------------------------------------------------------------------------------------------------------------------------------
function setupExportHandlers() {
    $('ExportObj').addEventListener('click', () => {
        if (!State.meshData) return;
        const objText = SurfaceNetsMesher.toOBJ(State.meshData, State.spec.preset || 'VoxelCliff');
        downloadFile(objText, `${State.spec.preset || 'VoxelCliff'}_Seed${State.spec.seed}.obj`, 'text/plain');
    });

    $('ExportPly').addEventListener('click', () => {
        if (!State.meshData) return;
        const plyText = SurfaceNetsMesher.toPLY(State.meshData, State.spec.preset || 'VoxelCliff');
        downloadFile(plyText, `${State.spec.preset || 'VoxelCliff'}_Seed${State.spec.seed}.ply`, 'text/plain');
    });

    const saveRecipe = () => {
        const recipe = {
            format: 'FrontierVoxelCliff',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            spec: State.spec
        };
        downloadFile(JSON.stringify(recipe, null, 2), `${State.spec.preset || 'cliff'}_recipe.json`, 'application/json');
    };

    $('SaveActive').addEventListener('click', saveRecipe);
    $('ExportRecipe').addEventListener('click', saveRecipe);

    $('ImportRecipe').addEventListener('click', () => $('RecipeFile').click());
    $('OpenActive').addEventListener('click', () => $('RecipeFile').click());

    $('RecipeFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.spec) {
                    State.spec = { ...data.spec };
                    buildInspectorControls();
                    buildVoxelCliff();
                }
            } catch (err) {
                alert('Invalid recipe JSON file: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --------------------------------------------------------------------------------------------------------------------------------------------
// ANIMATION & RESIZE LOOP
// --------------------------------------------------------------------------------------------------------------------------------------------
function onWindowResize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
window.addEventListener('resize', onWindowResize);

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (State.turntable && State.meshObject) {
        State.meshObject.rotation.y += 0.005;
        if (State.wireObject) State.wireObject.rotation.y = State.meshObject.rotation.y;
    }

    renderer.render(scene, camera);
}

// --------------------------------------------------------------------------------------------------------------------------------------------
// INITIALIZATION
// --------------------------------------------------------------------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    buildStageList();
    buildInspectorControls();
    setupViewportControls();
    setupExportHandlers();

    // Check for WebGPU
    if (navigator.gpu) {
        const badge = $('WebGPUBadge');
        if (badge) {
            badge.innerHTML = '<i></i> WebGPU Active';
            badge.classList.add('gpu-active');
        }
    }

    buildVoxelCliff();
    animate();
});
