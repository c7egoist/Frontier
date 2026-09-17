import React, { useState, useRef } from 'react';
import { BuildingConfig } from '../types/generator';
import { Sliders, Eye, EyeOff, Layers, Cpu, Zap, Box, Compass, Sparkles, Activity } from 'lucide-react';

interface GeometryNodesGraphProps {
  config: BuildingConfig;
  onChange: (updater: (prev: BuildingConfig) => BuildingConfig) => void;
  onSelectNodeCategory?: (category: string) => void;
}

interface NodeData {
  id: string;
  title: string;
  category: 'input' | 'mesh' | 'modifier' | 'material' | 'utility' | 'output';
  x: number;
  y: number;
  width: number;
  active: boolean;
  inputs: { label: string; type: string; value?: string | number | boolean }[];
  outputs: { label: string; type: string }[];
}

export const GeometryNodesGraph: React.FC<GeometryNodesGraphProps> = ({ config, onChange, onSelectNodeCategory }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('roof_generator');
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 30 });
  const [zoom, setZoom] = useState<number>(0.9);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Define Blender-like Geometry Nodes
  const nodes: NodeData[] = [
    {
      id: 'input_seed',
      title: 'Building Inputs',
      category: 'input',
      x: 30,
      y: 60,
      width: 240,
      active: true,
      inputs: [],
      outputs: [
        { label: 'Archetype', type: 'string' },
        { label: 'Seed', type: 'integer' },
        { label: 'Dimensions', type: 'vector' },
      ],
    },
    {
      id: 'floor_array',
      title: 'Floor Stack Array',
      category: 'mesh',
      x: 340,
      y: 50,
      width: 260,
      active: true,
      inputs: [
        { label: 'Floors', type: 'int', value: config.floors },
        { label: 'Height', type: 'float', value: `${config.floorHeight}m` },
        { label: 'Setback', type: 'float', value: config.terraceSetback },
      ],
      outputs: [
        { label: 'Floor Geometry', type: 'geometry' },
        { label: 'Floor Centers', type: 'vector_array' },
      ],
    },
    {
      id: 'timber_framing',
      title: 'Timber Posts & Beams',
      category: 'modifier',
      x: 340,
      y: 350,
      width: 260,
      active: true,
      inputs: [
        { label: 'Wood', type: 'enum', value: config.timber.woodType },
        { label: 'Balcony', type: 'bool', value: config.timber.hasEngawaBalcony },
        { label: 'Railing', type: 'bool', value: config.timber.balconyRailing },
      ],
      outputs: [
        { label: 'Hashira Posts', type: 'geometry' },
        { label: 'Nuki Beams', type: 'geometry' },
      ],
    },
    {
      id: 'dougong_brackets',
      title: 'Dougong Bracket Instancer',
      category: 'modifier',
      x: 670,
      y: 40,
      width: 270,
      active: config.timber.bracketStyle !== 'none',
      inputs: [
        { label: 'Style', type: 'enum', value: config.timber.bracketStyle },
        { label: 'Density', type: 'int', value: config.timber.bracketDensity },
      ],
      outputs: [
        { label: 'Bracket Instances', type: 'instances' },
        { label: 'Taruki Rafters', type: 'geometry' },
      ],
    },
    {
      id: 'roof_generator',
      title: 'Curved Eaves / Sori',
      category: 'mesh',
      x: 670,
      y: 320,
      width: 270,
      active: true,
      inputs: [
        { label: 'Roof Type', type: 'enum', value: config.roof.type },
        { label: 'Overhang', type: 'float', value: `${config.roof.overhang}m` },
        { label: 'Curvature (Sori)', type: 'float', value: config.roof.curvature },
        { label: 'Awnings', type: 'bool', value: config.roof.hasTieredEavesBetweenFloors },
      ],
      outputs: [
        { label: 'Roof Surface', type: 'geometry' },
        { label: 'Eaves Boundary', type: 'curves' },
      ],
    },
    {
      id: 'roof_tiles',
      title: 'Kawara Tile Displacer',
      category: 'modifier',
      x: 1010,
      y: 40,
      width: 270,
      active: config.roof.hasTiles,
      inputs: [
        { label: 'Enabled', type: 'bool', value: config.roof.hasTiles },
        { label: 'Tile Type', type: 'enum', value: config.roof.tileType },
        { label: 'Color', type: 'color', value: config.roof.color },
        { label: 'Ornament', type: 'enum', value: config.roof.ridgeOrnament },
      ],
      outputs: [
        { label: '3D Tiles Mesh', type: 'geometry' },
        { label: 'Onigawara Caps', type: 'instances' },
      ],
    },
    {
      id: 'utility_poles',
      title: 'Telephone Pole & Catenary',
      category: 'utility',
      x: 1010,
      y: 350,
      width: 280,
      active: config.electricity.hasPhonePole,
      inputs: [
        { label: 'Connected Pole', type: 'bool', value: config.electricity.hasPhonePole },
        { label: 'Sag Factor', type: 'float', value: config.electricity.sagFactor },
        { label: 'Wire Count', type: 'int', value: config.electricity.wireCount },
        { label: 'Transformers', type: 'bool', value: config.electricity.hasTransformers },
        { label: 'AC Units', type: 'bool', value: config.electricity.hasACUnits },
      ],
      outputs: [
        { label: 'Pole & Hardware', type: 'geometry' },
        { label: 'Sagging Cables', type: 'splines' },
      ],
    },
    {
      id: 'interior_tatami',
      title: 'Asian Interior & Decor',
      category: 'mesh',
      x: 1360,
      y: 40,
      width: 270,
      active: config.furniture.enabled,
      inputs: [
        { label: 'Tatami Mats', type: 'bool', value: config.furniture.hasTatami },
        { label: 'Chabudai Table', type: 'bool', value: config.furniture.hasChabudaiTable },
        { label: 'Zafu Cushions', type: 'bool', value: config.furniture.hasZafuCushions },
        { label: 'Bonsai Pine', type: 'bool', value: config.furniture.hasBonsai },
        { label: 'Andon Lamp', type: 'bool', value: config.furniture.hasAndonLamp },
      ],
      outputs: [
        { label: 'Furniture Mesh', type: 'geometry' },
        { label: 'Tatami Layout', type: 'instances' },
      ],
    },
    {
      id: 'signage_lighting',
      title: 'Signage & Neon Lights',
      category: 'material',
      x: 1360,
      y: 350,
      width: 280,
      active: config.lighting.enabled,
      inputs: [
        { label: 'Main Sign', type: 'string', value: config.signage.mainSignText },
        { label: 'Vertical Neon', type: 'string', value: config.signage.neonVerticalText },
        { label: 'Lanterns', type: 'int', value: config.lighting.lanternCount },
        { label: 'Eaves LED', type: 'bool', value: config.lighting.hasEavesLED },
      ],
      outputs: [
        { label: 'Emissive Meshes', type: 'geometry' },
        { label: 'Point Lights', type: 'lights' },
      ],
    },
    {
      id: 'group_output',
      title: 'Group Output (AAA Mesh)',
      category: 'output',
      x: 1710,
      y: 180,
      width: 260,
      active: true,
      inputs: [
        { label: 'Structural Geometry', type: 'geometry' },
        { label: 'Roof & Tiles', type: 'geometry' },
        { label: 'Utilities & Poles', type: 'geometry' },
        { label: 'Interior Furniture', type: 'geometry' },
        { label: 'Signage & Lights', type: 'geometry' },
      ],
      outputs: [
        { label: 'GLTF / Unreal UE5', type: 'engine_export' },
      ],
    },
  ];

  // Connections (Noodles) between nodes
  const connections = [
    { from: 'input_seed', fromIdx: 0, to: 'floor_array', toIdx: 0 },
    { from: 'input_seed', fromIdx: 2, to: 'timber_framing', toIdx: 0 },
    { from: 'floor_array', fromIdx: 0, to: 'dougong_brackets', toIdx: 0 },
    { from: 'floor_array', fromIdx: 0, to: 'roof_generator', toIdx: 0 },
    { from: 'timber_framing', fromIdx: 0, to: 'dougong_brackets', toIdx: 1 },
    { from: 'roof_generator', fromIdx: 0, to: 'roof_tiles', toIdx: 0 },
    { from: 'roof_generator', fromIdx: 1, to: 'utility_poles', toIdx: 0 },
    { from: 'floor_array', fromIdx: 1, to: 'interior_tatami', toIdx: 0 },
    { from: 'floor_array', fromIdx: 0, to: 'signage_lighting', toIdx: 0 },
    { from: 'dougong_brackets', fromIdx: 0, to: 'group_output', toIdx: 0 },
    { from: 'roof_tiles', fromIdx: 0, to: 'group_output', toIdx: 1 },
    { from: 'utility_poles', fromIdx: 0, to: 'group_output', toIdx: 2 },
    { from: 'interior_tatami', fromIdx: 0, to: 'group_output', toIdx: 3 },
    { from: 'signage_lighting', fromIdx: 0, to: 'group_output', toIdx: 4 },
  ];

  // Category Color Map (Matches Blender Geometry Nodes)
  const getCategoryHeaderClass = (cat: NodeData['category']) => {
    switch (cat) {
      case 'input':
        return 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300';
      case 'mesh':
        return 'bg-amber-950/90 border-amber-500/60 text-amber-300';
      case 'modifier':
        return 'bg-sky-950/90 border-sky-500/60 text-sky-300';
      case 'material':
        return 'bg-rose-950/90 border-rose-500/60 text-rose-300';
      case 'utility':
        return 'bg-purple-950/90 border-purple-500/60 text-purple-300';
      case 'output':
        return 'bg-slate-800/90 border-slate-400/60 text-slate-200';
    }
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.node-card')) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (!isDraggingCanvas) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUpCanvas = () => {
    setIsDraggingCanvas(false);
  };

  // Node toggle bypass logic
  const toggleNodeActive = (nodeId: string) => {
    if (nodeId === 'roof_tiles') {
      onChange(prev => ({
        ...prev,
        roof: { ...prev.roof, hasTiles: !prev.roof.hasTiles }
      }));
    } else if (nodeId === 'utility_poles') {
      onChange(prev => ({
        ...prev,
        electricity: { ...prev.electricity, hasPhonePole: !prev.electricity.hasPhonePole }
      }));
    } else if (nodeId === 'interior_tatami') {
      onChange(prev => ({
        ...prev,
        furniture: { ...prev.furniture, enabled: !prev.furniture.enabled }
      }));
    } else if (nodeId === 'signage_lighting') {
      onChange(prev => ({
        ...prev,
        lighting: { ...prev.lighting, enabled: !prev.lighting.enabled }
      }));
    } else if (nodeId === 'dougong_brackets') {
      onChange(prev => ({
        ...prev,
        timber: {
          ...prev.timber,
          bracketStyle: prev.timber.bracketStyle === 'none' ? 'dougong_triple' : 'none'
        }
      }));
    }
  };

  return (
    <div 
      className="relative w-full h-full bg-[#0d1117] overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
      onMouseLeave={handleMouseUpCanvas}
    >
      {/* Background Blender Node Grid */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <defs>
          <pattern id="node-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#30363d" strokeWidth="0.5" />
          </pattern>
          <pattern id="node-grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#node-grid-small)" />
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#484f58" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#node-grid-large)" />
      </svg>

      {/* Top Node Editor Header */}
      <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-[#161b22]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-xl text-xs">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-200">Geometry Nodes Pipeline</span>
          <span className="text-slate-500 font-mono">v4.2 Procedural DAG</span>
          <div className="h-3 w-px bg-slate-700 mx-1" />
          <span className="text-emerald-400 font-mono">10 Active Nodes</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 bg-[#161b22]/90 backdrop-blur-md px-2 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300">
          <button 
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} 
            className="px-2 py-0.5 rounded hover:bg-slate-700 font-mono"
          >
            -
          </button>
          <span className="font-mono text-slate-400">{Math.round(zoom * 100)}%</span>
          <button 
            onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} 
            className="px-2 py-0.5 rounded hover:bg-slate-700 font-mono"
          >
            +
          </button>
          <button 
            onClick={() => { setPan({ x: 40, y: 30 }); setZoom(0.9); }} 
            className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[11px]"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Nodes & Connections Canvas Container */}
      <div 
        className="absolute top-0 left-0 origin-top-left transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {/* SVG Bezier Noodle Connections */}
        <svg className="absolute top-0 left-0 w-[2400px] h-[1200px] pointer-events-none z-0">
          {connections.map((conn, idx) => {
            const src = nodes.find(n => n.id === conn.from);
            const dst = nodes.find(n => n.id === conn.to);
            if (!src || !dst) return null;

            // Compute connection socket coordinates
            const startX = src.x + src.width;
            const startY = src.y + 65 + conn.fromIdx * 24;
            const endX = dst.x;
            const endY = dst.y + 65 + conn.toIdx * 24;

            const dx = Math.abs(endX - startX) * 0.55;
            const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

            const isHighlighted = selectedNodeId === src.id || selectedNodeId === dst.id;

            return (
              <g key={idx}>
                {/* Glow under noodle */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isHighlighted ? '#00f5d4' : '#58a6ff'}
                  strokeWidth={isHighlighted ? 4 : 2.5}
                  strokeOpacity={isHighlighted ? 0.9 : 0.45}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>

        {/* Node Cards */}
        {nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const headerStyle = getCategoryHeaderClass(node.category);

          return (
            <div
              key={node.id}
              onClick={() => {
                setSelectedNodeId(node.id);
                if (onSelectNodeCategory) onSelectNodeCategory(node.id);
              }}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.width}px`,
              }}
              className={`node-card absolute z-10 rounded-xl bg-[#161b22]/95 border transition-shadow shadow-2xl backdrop-blur-md cursor-pointer ${
                isSelected 
                  ? 'border-emerald-400 ring-2 ring-emerald-400/40 shadow-emerald-950/50' 
                  : 'border-slate-700 hover:border-slate-500'
              } ${!node.active ? 'opacity-50' : 'opacity-100'}`}
            >
              {/* Node Header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-b ${headerStyle}`}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-2.5 h-2.5 rounded-full bg-current opacity-80" />
                  <span className="font-semibold text-xs tracking-wide truncate">{node.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeActive(node.id);
                  }}
                  title={node.active ? "Mute node" : "Unmute node"}
                  className="p-1 rounded hover:bg-black/30 transition-colors"
                >
                  {node.active ? (
                    <Eye className="w-3.5 h-3.5 text-slate-300" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-red-400" />
                  )}
                </button>
              </div>

              {/* Node Body with Input / Output Sockets */}
              <div className="p-3 text-xs space-y-2">
                {/* Inputs */}
                {node.inputs.map((inp, i) => (
                  <div key={i} className="flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-sky-400 border border-black shadow-sm" />
                      <span className="text-[11px] text-slate-400">{inp.label}</span>
                    </div>
                    {inp.value !== undefined && (
                      <span className="font-mono text-[11px] text-emerald-300 bg-black/40 px-1.5 py-0.5 rounded border border-slate-800">
                        {String(inp.value)}
                      </span>
                    )}
                  </div>
                ))}

                {/* Outputs */}
                {node.outputs.map((out, i) => (
                  <div key={i} className="flex items-center justify-end gap-2 text-slate-300 pt-0.5">
                    <span className="text-[11px] text-slate-400">{out.label}</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 border border-black shadow-sm" />
                  </div>
                ))}
              </div>

              {/* Interactive Quick-Slider for Floor Stack */}
              {node.id === 'floor_array' && (
                <div className="px-3 pb-2.5 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Floors:</span>
                    <span className="font-mono text-emerald-400 font-semibold">{config.floors}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={config.floors}
                    onChange={(e) => {
                      const f = parseInt(e.target.value);
                      onChange(prev => ({ ...prev, floors: f }));
                    }}
                    className="w-full accent-emerald-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              )}

              {/* Interactive Quick-Toggle for Roof Tiles */}
              {node.id === 'roof_tiles' && (
                <div className="px-3 pb-2.5 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">3D Tiles:</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        roof: { ...prev.roof, hasTiles: !prev.roof.hasTiles }
                      }));
                    }}
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded transition-colors ${
                      config.roof.hasTiles 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {config.roof.hasTiles ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              )}

              {/* Interactive Quick-Toggle for Telephone Pole */}
              {node.id === 'utility_poles' && (
                <div className="px-3 pb-2.5 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Connected Pole:</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        electricity: { ...prev.electricity, hasPhonePole: !prev.electricity.hasPhonePole }
                      }));
                    }}
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded transition-colors ${
                      config.electricity.hasPhonePole 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' 
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {config.electricity.hasPhonePole ? 'CONNECTED' : 'DISCONNECTED'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Info Footer */}
      <div className="absolute bottom-3 left-4 bg-[#161b22]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-[11px] text-slate-400 flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          Realtime Procedural Evaluation
        </span>
        <span className="text-slate-600">|</span>
        <span>Drag canvas to pan • Click node to inspect • Click eye to toggle modifier</span>
      </div>
    </div>
  );
};
