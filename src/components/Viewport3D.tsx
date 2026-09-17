import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BuildingConfig } from '../types/generator';
import { BuildingGenerator, GenerationStats } from '../generator/buildingGenerator';
import { 
  Camera, 
  RotateCw, 
  Box, 
  Layers, 
  Maximize2, 
  Minimize2, 
  Sun, 
  Moon, 
  Sparkles,
  Info,
  Maximize,
  Download,
  AlertCircle
} from 'lucide-react';

interface Viewport3DProps {
  config: BuildingConfig;
  onUpdateStats?: (stats: GenerationStats) => void;
  buildingGeneratorRef?: React.MutableRefObject<BuildingGenerator | null>;
  currentRootRef?: React.MutableRefObject<THREE.Group | null>;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  config,
  onUpdateStats,
  buildingGeneratorRef,
  currentRootRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const generatorRef = useRef<BuildingGenerator | null>(null);
  const currentBuildingGroupRef = useRef<THREE.Group | null>(null);
  const isFirstMountRef = useRef<boolean>(true);

  const [fps, setFps] = useState<number>(60);
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(config.rendering.autoRotate);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = Math.max(containerRef.current.clientWidth, 640);
    const height = Math.max(containerRef.current.clientHeight, 480);

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(22, 14, 26);
    cameraRef.current = camera;

    // 3. Renderer with error safety
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;
    } catch (e: any) {
      console.error("WebGL context creation error:", e);
      setRenderError(e.message || "Failed to initialize WebGL context.");
      return;
    }

    // 4. OrbitControls
    const controls = new OrbitControls(camera, canvasRef.current);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.02;
    controls.minDistance = 3;
    controls.maxDistance = 90;
    controls.target.set(0, 5, 0);
    controlsRef.current = controls;

    // 5. Generator
    let generator: BuildingGenerator;
    try {
      generator = new BuildingGenerator(config);
      generatorRef.current = generator;
      if (buildingGeneratorRef) {
        buildingGeneratorRef.current = generator;
      }

      // 6. Build initial building
      const { root, stats: initialStats } = generator.generate();
      scene.add(root);
      currentBuildingGroupRef.current = root;
      if (currentRootRef) {
        currentRootRef.current = root;
      }
      setStats(initialStats);
      if (onUpdateStats) onUpdateStats(initialStats);
    } catch (err: any) {
      console.error("Building generation failed on mount:", err);
      setRenderError(err.message || "Failed to generate building.");
    }

    // 7. Setup Environment Lighting
    setupEnvironment(scene, config.rendering.environment);

    // 8. Animation & Render Loop
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const animate = (currentTime: number) => {
      animId = requestAnimationFrame(animate);

      frameCount++;
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // 9. Resize Observer
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const newW = containerRef.current.clientWidth;
      const newH = containerRef.current.clientHeight;
      if (newW > 10 && newH > 10) {
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  // Update Building Geometry when config changes (skip initial mount to avoid double generation)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (!sceneRef.current || !generatorRef.current) return;

    try {
      const scene = sceneRef.current;
      generatorRef.current.updateConfig(config);

      // Remove old building
      if (currentBuildingGroupRef.current) {
        scene.remove(currentBuildingGroupRef.current);
      }

      // Generate new building
      const { root, stats: newStats } = generatorRef.current.generate();
      scene.add(root);
      currentBuildingGroupRef.current = root;
      if (currentRootRef) {
        currentRootRef.current = root;
      }

      setStats(newStats);
      if (onUpdateStats) onUpdateStats(newStats);

      // Apply wireframe if active
      if (isWireframe) {
        applyWireframe(root, true);
      }

      // Update environment lighting
      setupEnvironment(scene, config.rendering.environment);
      setRenderError(null);
    } catch (err: any) {
      console.error("Error during procedural regeneration:", err);
      setRenderError(err.message || "Regeneration failed.");
    }
  }, [config]);

  // Handle Wireframe toggle
  const applyWireframe = (obj: THREE.Object3D, enabled: boolean) => {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => (m.wireframe = enabled));
        } else if (mesh.material) {
          mesh.material.wireframe = enabled;
        }
      }
    });
  };

  const toggleWireframe = () => {
    const next = !isWireframe;
    setIsWireframe(next);
    if (currentBuildingGroupRef.current) {
      applyWireframe(currentBuildingGroupRef.current, next);
    }
  };

  // Handle Auto-rotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 1.0;
    }
  }, [autoRotate]);

  // Setup Dynamic Atmosphere and Lighting
  const setupEnvironment = (scene: THREE.Scene, envMode: string) => {
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((child) => {
      if (child !== currentBuildingGroupRef.current) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => scene.remove(obj));

    switch (envMode) {
      case 'cyberpunk_night': {
        scene.background = new THREE.Color('#080c14');
        scene.fog = new THREE.FogExp2('#090d16', 0.018);

        const amb = new THREE.AmbientLight('#1d2d44', 0.8);
        scene.add(amb);

        const dir = new THREE.DirectionalLight('#00f5d4', 1.2);
        dir.position.set(-20, 25, -20);
        scene.add(dir);

        const magentaRim = new THREE.DirectionalLight('#f72585', 1.4);
        magentaRim.position.set(25, 20, 20);
        magentaRim.castShadow = true;
        magentaRim.shadow.mapSize.width = 2048;
        magentaRim.shadow.mapSize.height = 2048;
        scene.add(magentaRim);
        break;
      }

      case 'dusk_golden': {
        scene.background = new THREE.Color('#22152b');
        scene.fog = new THREE.FogExp2('#241730', 0.012);

        const amb = new THREE.AmbientLight('#4a2840', 1.0);
        scene.add(amb);

        const sun = new THREE.DirectionalLight('#ff9e00', 3.0);
        sun.position.set(30, 16, 25);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);
        break;
      }

      case 'kyoto_day': {
        scene.background = new THREE.Color('#8ecae6');
        scene.fog = new THREE.FogExp2('#98d2ec', 0.008);

        const hemi = new THREE.HemisphereLight('#f1faee', '#457b9d', 1.2);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight('#ffffff', 2.8);
        sun.position.set(25, 35, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);
        break;
      }

      case 'clay_studio':
      case 'wireframe':
      default: {
        scene.background = new THREE.Color('#1e232a');
        scene.fog = null;

        const amb = new THREE.AmbientLight('#8d99ae', 1.4);
        scene.add(amb);

        const key = new THREE.DirectionalLight('#ffffff', 2.0);
        key.position.set(20, 30, 20);
        key.castShadow = true;
        scene.add(key);

        const fill = new THREE.DirectionalLight('#cbd5e1', 1.0);
        fill.position.set(-20, 20, -20);
        scene.add(fill);
        break;
      }
    }
  };

  // Camera Quick-View Positions
  const setCameraView = (type: 'facade' | 'roof' | 'interior' | 'pole' | 'isometric') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    const bH = stats?.totalHeight || 8;
    const bW = stats?.boundingWidth || 10;
    const bD = stats?.boundingDepth || 10;

    switch (type) {
      case 'facade':
        cam.position.set(0, 3.5, bD * 1.5 + 4);
        ctrl.target.set(0, 3.0, 0);
        break;
      case 'roof':
        cam.position.set(0, bH + 3.5, bD * 0.9 + 5);
        ctrl.target.set(0, bH - 0.5, 0);
        break;
      case 'interior':
        cam.position.set(0, 1.6, bD * 0.45);
        ctrl.target.set(0, 1.2, 0);
        break;
      case 'pole':
        cam.position.set(bW * 0.7 + 6, 8, bD * 0.7 + 7);
        ctrl.target.set(bW * 0.6 + 4, 6, bD * 0.6);
        break;
      case 'isometric':
      default:
        cam.position.set(bW * 1.8, bH * 1.6, bD * 1.8);
        ctrl.target.set(0, bH * 0.4, 0);
        break;
    }
    ctrl.update();
  };

  // Take high-res snapshot
  const takeScreenshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `procedural_building_${config.archetype}_${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#0a0d14]">
      {/* 3D WebGL Canvas */}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block cursor-grab active:cursor-grabbing" 
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Render Error Alert Notice */}
      {renderError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2 rounded-xl backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{renderError}</span>
        </div>
      )}

      {/* Top Floating Camera Presets Bar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-[#121824]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-2xl text-xs">
        <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
          <Camera className="w-3.5 h-3.5 text-cyan-400" />
          Camera:
        </span>
        <button
          onClick={() => setCameraView('isometric')}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          Isometric
        </button>
        <button
          onClick={() => setCameraView('facade')}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          Front Store
        </button>
        <button
          onClick={() => setCameraView('roof')}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          Curved Eaves
        </button>
        <button
          onClick={() => setCameraView('interior')}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          Tatami Room
        </button>
        <button
          onClick={() => setCameraView('pole')}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          Phone Pole
        </button>
      </div>

      {/* Top Right Action Tools */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          title="Toggle Turntable Rotation"
          className={`p-2 rounded-xl backdrop-blur-md border shadow-xl transition-all ${
            autoRotate 
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' 
              : 'bg-[#121824]/90 border-slate-700/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <RotateCw className={`w-4 h-4 ${autoRotate ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={toggleWireframe}
          title="Toggle Wireframe Inspection"
          className={`p-2 rounded-xl backdrop-blur-md border shadow-xl transition-all ${
            isWireframe 
              ? 'bg-amber-500/20 border-amber-400 text-amber-300' 
              : 'bg-[#121824]/90 border-slate-700/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Box className="w-4 h-4" />
        </button>

        <button
          onClick={takeScreenshot}
          title="Capture High-Res Viewport Screenshot"
          className="p-2 rounded-xl bg-[#121824]/90 backdrop-blur-md border border-slate-700/60 text-slate-300 hover:bg-slate-800 shadow-xl transition-all"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Left Live Stats Badge */}
      <div className="absolute bottom-4 left-4 z-10 bg-[#121824]/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/60 shadow-2xl text-xs space-y-1.5 pointer-events-none">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-1.5">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            AAA Asset Inspector
          </span>
          <span className="font-mono text-emerald-400 font-semibold">{fps} FPS</span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400 font-mono text-[11px]">
          <div>Polys / Tris: <span className="text-slate-200 font-semibold">{stats?.triangleCount.toLocaleString() || '...'}</span></div>
          <div>Vertices: <span className="text-slate-200 font-semibold">{stats?.vertexCount.toLocaleString() || '...'}</span></div>
          <div>Submeshes: <span className="text-slate-200 font-semibold">{stats?.meshCount || '...'}</span></div>
          <div>Height: <span className="text-cyan-400 font-semibold">{stats?.totalHeight}m</span></div>
          <div>Footprint: <span className="text-slate-200">{stats?.boundingWidth}m × {stats?.boundingDepth}m</span></div>
          <div>Target Engine: <span className="text-emerald-400">UE5 Nanite</span></div>
        </div>
      </div>
    </div>
  );
};
