import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { BuildingConfig } from './types/generator';
import { BUILDING_PRESETS } from './types/presets';
import { Viewport3D } from './components/Viewport3D';
import { GeometryNodesGraph } from './components/GeometryNodesGraph';
import { ControlsPanel } from './components/ControlsPanel';
import { exportToGLB, exportToOBJ, exportConfigJSON } from './utils/exporters';
import { generateBlenderPythonScript } from './utils/blenderExporter';
import { BuildingGenerator, GenerationStats } from './generator/buildingGenerator';
import { 
  Box, 
  Cpu, 
  Columns, 
  Sparkles, 
  Download, 
  Shuffle, 
  Layers, 
  RotateCcw,
  ExternalLink,
  Flame,
  Terminal,
  Activity
} from 'lucide-react';

export const App: React.FC = () => {
  // Start with Cyberpunk Izakaya preset
  const [config, setConfig] = useState<BuildingConfig>(BUILDING_PRESETS.cyberpunk_izakaya.config);
  const [viewMode, setViewMode] = useState<'viewport' | 'nodes' | 'split'>('viewport');
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [activeInspectorCategory, setActiveInspectorCategory] = useState<string>('architecture');

  const buildingGeneratorRef = useRef<BuildingGenerator | null>(null);
  const currentRootRef = useRef<THREE.Group | null>(null);

  // Quick Randomize Seed
  const handleRandomize = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    setConfig(prev => ({ ...prev, seed: newSeed }));
  };

  // Reset to default preset
  const handleReset = () => {
    setConfig({ ...BUILDING_PRESETS.cyberpunk_izakaya.config });
  };

  // Export Handlers
  const handleExportGLB = () => {
    if (currentRootRef.current) {
      exportToGLB(currentRootRef.current, `asian_building_${config.archetype}_seed${config.seed}.glb`);
    }
  };

  const handleExportOBJ = () => {
    if (currentRootRef.current) {
      exportToOBJ(currentRootRef.current, `asian_building_${config.archetype}_seed${config.seed}.obj`);
    }
  };

  const handleExportBlenderScript = () => {
    const script = generateBlenderPythonScript(config);
    const blob = new Blob([script], { type: 'text/x-python' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `generate_${config.archetype}_geonodes.py`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleExportJSON = () => {
    exportConfigJSON(config, `building_preset_${config.archetype}.json`);
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#0a0d14] font-sans">
      {/* Top Application Navigation Bar */}
      <header className="h-14 bg-[#0e131d] border-b border-slate-800/80 px-4 flex items-center justify-between z-30 select-none shadow-xl">
        {/* Logo & Product Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 shadow-lg shadow-emerald-950/60 text-white font-bold text-lg font-serif">
            東
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-white uppercase font-sans">
                NEO-ASIAN PROCEDURAL ARCHITECTURE
              </span>
              <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                AAA STUDIO
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Ancient Timber & Eaves Retrofitted with Modern Cyber Infrastructure
            </span>
          </div>
        </div>

        {/* Center Workspace Mode Switcher */}
        <div className="flex items-center bg-[#141b29] p-1 rounded-xl border border-slate-700/60 shadow-inner">
          <button
            onClick={() => setViewMode('viewport')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'viewport'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span>3D Viewport</span>
          </button>

          <button
            onClick={() => setViewMode('nodes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'nodes'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Geometry Nodes</span>
          </button>

          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'split'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Columns className="w-3.5 h-3.5 text-amber-400" />
            <span>Split View</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRandomize}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#192236] hover:bg-[#222e47] text-emerald-300 rounded-xl border border-emerald-500/30 transition-all font-mono font-medium shadow-sm"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Seed: {config.seed}</span>
          </button>

          <button
            onClick={handleExportGLB}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950/40 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export GLB</span>
          </button>

          <button
            onClick={handleReset}
            title="Reset to default preset"
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Center Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left / Center Viewports Container */}
        <div className="flex-1 flex h-full overflow-hidden relative">
          {viewMode === 'viewport' && (
            <div className="w-full h-full relative">
              <Viewport3D
                config={config}
                onUpdateStats={setStats}
                buildingGeneratorRef={buildingGeneratorRef}
                currentRootRef={currentRootRef}
              />
            </div>
          )}

          {viewMode === 'nodes' && (
            <div className="w-full h-full relative">
              <GeometryNodesGraph
                config={config}
                onChange={setConfig}
                onSelectNodeCategory={setActiveInspectorCategory}
              />
            </div>
          )}

          {viewMode === 'split' && (
            <div className="flex w-full h-full">
              <div className="w-1/2 h-full border-r border-slate-800 relative">
                <Viewport3D
                  config={config}
                  onUpdateStats={setStats}
                  buildingGeneratorRef={buildingGeneratorRef}
                  currentRootRef={currentRootRef}
                />
              </div>
              <div className="w-1/2 h-full relative">
                <GeometryNodesGraph
                  config={config}
                  onChange={setConfig}
                  onSelectNodeCategory={setActiveInspectorCategory}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Controls & Inspector Panel */}
        <ControlsPanel
          config={config}
          onChange={setConfig}
          onExportGLB={handleExportGLB}
          onExportOBJ={handleExportOBJ}
          onExportBlenderScript={handleExportBlenderScript}
          onExportJSON={handleExportJSON}
          activeTab={activeInspectorCategory}
          setActiveTab={setActiveInspectorCategory}
        />
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-7 bg-[#0b0f17] border-t border-slate-800/80 px-4 flex items-center justify-between text-[11px] text-slate-400 select-none z-20">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Procedural Engine Online
          </span>
          <span className="text-slate-600">|</span>
          <span>Archetype: <strong className="text-slate-200">{config.archetype.replace('_', ' ').toUpperCase()}</strong></span>
          <span className="text-slate-600">|</span>
          <span>Roof: <strong className="text-slate-200">{config.roof.type} ({config.roof.tileType})</strong></span>
          <span className="text-slate-600">|</span>
          <span>Pole: <strong className={config.electricity.hasPhonePole ? "text-purple-400" : "text-slate-500"}>{config.electricity.hasPhonePole ? "Connected" : "None"}</strong></span>
        </div>

        <div className="flex items-center gap-4 font-mono text-slate-400">
          <span>Triangles: <strong className="text-slate-200">{stats?.triangleCount.toLocaleString() || '...'}</strong></span>
          <span>Height: <strong className="text-cyan-400">{stats?.totalHeight || '...'}m</strong></span>
          <span className="text-slate-500">Rotate: Left-Click • Pan: Right-Click • Zoom: Wheel</span>
        </div>
      </footer>
    </div>
  );
};
export default App;
