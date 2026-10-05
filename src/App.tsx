import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import {
  MousePointer2, PenTool, Hand, Settings, Trash2, Route, CircleDot, Layers,
  Box, Mountain, Landmark, Search, X, Plus, Eye, EyeOff, ChevronDown, ChevronRight,
  SlidersHorizontal, Sparkles, MoveUpRight, Ruler, Building2, Hammer
} from 'lucide-react';
import { RoadNetwork, RoadSpline } from './components/RoadNetwork';
import { SplineEditor } from './components/SplineEditor';
import { Vec3 } from './lib/geometry';

type Mode = 'select' | 'draw' | 'bridge' | 'elevate';
type SplineNode = { id: string; position: Vec3; handle1: Vec3; handle2: Vec3; };

const generateId = () => Math.random().toString(36).substring(2, 9);

function createDefaultSpline(): RoadSpline {
  const id = generateId();
  return {
    id,
    name: `Road ${id.toUpperCase()}`,
    nodes: [],
    closed: false,
    profile: {
      roadWidth: 8,
      laneCount: 2,
      paveLeft: 2.2,
      paveRight: 2.2,
      curbHeight: 0.15,
      isBridge: false,
      bridgeDepth: 1.2,
      bridgePillarSpacing: 18,
      elevation: 0,
    },
    visible: true,
  };
}

function createSampleRoads(): RoadSpline[] {
  // Curvy road to demonstrate pavement fix
  const road1: RoadSpline = {
    id: 'sample-curvy',
    name: 'Curvy Boulevard',
    nodes: [
      { id: 'n1', position: [-30, -10, 0] as Vec3, handle1: [-30, -10, 0] as Vec3, handle2: [-15, -10, 0] as Vec3 },
      { id: 'n2', position: [-5, -5, 0.5] as Vec3, handle1: [-12, -8, 0.5] as Vec3, handle2: [5, -2, 0.5] as Vec3 },
      { id: 'n3', position: [10, 10, 1] as Vec3, handle1: [2, 4, 1] as Vec3, handle2: [18, 16, 1] as Vec3 },
      { id: 'n4', position: [25, 15, 0.5] as Vec3, handle1: [18, 12, 0.5] as Vec3, handle2: [30, 18, 0.5] as Vec3 },
      { id: 'n5', position: [40, 5, 0] as Vec3, handle1: [35, 10, 0] as Vec3, handle2: [40, 5, 0] as Vec3 },
    ],
    closed: false,
    profile: { roadWidth: 9, laneCount: 2, paveLeft: 2.5, paveRight: 2.5, curbHeight: 0.18, isBridge: false, bridgeDepth: 1.2, bridgePillarSpacing: 16, elevation: 0 },
    visible: true,
  };

  // Bridge road - elevated S curve
  const road2: RoadSpline = {
    id: 'sample-bridge',
    name: 'Harbor Bridge',
    nodes: [
      { id: 'b1', position: [-40, 20, 0] as Vec3, handle1: [-40, 20, 0] as Vec3, handle2: [-25, 20, 1] as Vec3 },
      { id: 'b2', position: [-10, 22, 6] as Vec3, handle1: [-20, 21, 6] as Vec3, handle2: [0, 23, 6] as Vec3 },
      { id: 'b3', position: [10, 25, 7] as Vec3, handle1: [0, 24, 7] as Vec3, handle2: [20, 26, 7] as Vec3 },
      { id: 'b4', position: [35, 30, 6] as Vec3, handle1: [25, 28, 6] as Vec3, handle2: [45, 32, 6] as Vec3 },
      { id: 'b5', position: [60, 35, 0] as Vec3, handle1: [50, 33, 1] as Vec3, handle2: [60, 35, 0] as Vec3 },
    ],
    closed: false,
    profile: { roadWidth: 10, laneCount: 2, paveLeft: 1.8, paveRight: 1.8, curbHeight: 0.15, isBridge: true, bridgeDepth: 1.5, bridgePillarSpacing: 14, elevation: 0 },
    visible: true,
  };

  // Tight curve to test pavement fix
  const road3: RoadSpline = {
    id: 'sample-tight',
    name: 'Tight Curve Test',
    nodes: [
      { id: 't1', position: [-10, -30, 0] as Vec3, handle1: [-10, -30, 0] as Vec3, handle2: [-10, -20, 0] as Vec3 },
      { id: 't2', position: [-12, -5, 0] as Vec3, handle1: [-12, -15, 0] as Vec3, handle2: [-8, 0, 0] as Vec3 },
      { id: 't3', position: [5, 0, 0] as Vec3, handle1: [-5, 0, 0] as Vec3, handle2: [12, 2, 0] as Vec3 },
      { id: 't4', position: [20, -10, 0] as Vec3, handle1: [12, -5, 0] as Vec3, handle2: [20, -10, 0] as Vec3 },
    ],
    closed: false,
    profile: { roadWidth: 7, laneCount: 2, paveLeft: 2, paveRight: 2, curbHeight: 0.15, isBridge: false, bridgeDepth: 1.2, bridgePillarSpacing: 18, elevation: 0 },
    visible: true,
  };

  return [road1, road2, road3];
}

export default function App() {
  const [splines, setSplines] = useState<RoadSpline[]>(() => createSampleRoads());
  const [activeSplineId, setActiveSplineId] = useState<string | null>('sample-curvy');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showPavementFix, setShowPavementFix] = useState(true);
  const [bridgeMode, setBridgeMode] = useState(false);

  const activeSpline = splines.find(s => s.id === activeSplineId) || splines.find(s => s.nodes.some(n => n.id === selectedNodeId)) || null;
  const selectedNode = activeSpline?.nodes.find(n => n.id === selectedNodeId) || null;

  const filteredSplines = useMemo(() => {
    if (!search) return splines;
    return splines.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [splines, search]);

  const handlePlaneClick = (e: any) => {
    if (mode !== 'draw') return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const point = e.point as THREE.Vector3;
    const pos: Vec3 = [point.x, -point.z, point.y];

    const newNode: SplineNode = { id: generateId(), position: pos, handle1: pos, handle2: pos };

    if (!activeSplineId) {
      const newSpline = createDefaultSpline();
      newSpline.nodes = [newNode];
      newSpline.name = `Road ${splines.length + 1}`;
      setSplines(prev => [...prev, newSpline]);
      setActiveSplineId(newSpline.id);
      setSelectedNodeId(newNode.id);
    } else {
      setSplines(prev => prev.map(s => {
        if (s.id !== activeSplineId) return s;
        const isFirst = s.nodes[0]?.id === selectedNodeId;
        return { ...s, nodes: isFirst ? [newNode, ...s.nodes] : [...s.nodes, newNode] };
      }));
      setSelectedNodeId(newNode.id);
    }
  };

  const handleNodeClick = (e: any, splineId: string, nodeId: string, isEndpoint: boolean) => {
    e.stopPropagation();
    if (mode === 'pan') return;

    if (mode === 'draw') {
      if (!activeSplineId) {
        const targetNode = splines.find(s => s.id === splineId)?.nodes.find(n => n.id === nodeId);
        if (targetNode) {
          const newNode: SplineNode = { id: generateId(), position: [...targetNode.position] as Vec3, handle1: [...targetNode.position] as Vec3, handle2: [...targetNode.position] as Vec3 };
          const newSpline = createDefaultSpline();
          newSpline.nodes = [newNode];
          newSpline.name = `Road ${splines.length + 1}`;
          setSplines(prev => [...prev, newSpline]);
          setActiveSplineId(newSpline.id);
          setSelectedNodeId(newNode.id);
        }
        return;
      }
      if (activeSplineId === splineId) {
        if (isEndpoint && selectedNodeId !== nodeId) {
          setSplines(prev => prev.map(s => s.id === splineId ? { ...s, closed: true } : s));
          setMode('select');
        }
        return;
      }
      if (isEndpoint) {
        setSplines(prev => {
          const active = prev.find(s => s.id === activeSplineId);
          const target = prev.find(s => s.id === splineId);
          if (!active || !target) return prev;
          const activeIsFirst = active.nodes[0].id === selectedNodeId;
          const activeNodes = activeIsFirst ? [...active.nodes].reverse() : [...active.nodes];
          const targetIsFirst = target.nodes[0].id === nodeId;
          const targetNodes = targetIsFirst ? [...target.nodes] : [...target.nodes].reverse();
          const merged = [...activeNodes, ...targetNodes];
          return prev.filter(s => s.id !== activeSplineId && s.id !== splineId).concat({ ...target, nodes: merged });
        });
        setActiveSplineId(splineId);
        setSelectedNodeId(nodeId);
        setMode('select');
        return;
      }
      return;
    }

    setSelectedNodeId(nodeId);
    setActiveSplineId(splineId);
  };

  const updateNode = (splineId: string, nodeId: string, updates: Partial<SplineNode>) => {
    setSplines(prev => prev.map(s => s.id === splineId ? { ...s, nodes: s.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } : s));
  };

  const updateSplinePosition = (splineId: string, dx: number, dy: number, dz: number) => {
    setSplines(prev => prev.map(s => {
      if (s.id !== splineId) return s;
      return {
        ...s,
        nodes: s.nodes.map(n => ({
          ...n,
          position: [n.position[0] + dx, n.position[1] + dy, n.position[2] + dz],
          handle1: [n.handle1[0] + dx, n.handle1[1] + dy, n.handle1[2] + dz],
          handle2: [n.handle2[0] + dx, n.handle2[1] + dy, n.handle2[2] + dz],
        }))
      };
    }));
  };

  const updateProfile = (key: string, value: any) => {
    if (!activeSpline) return;
    setSplines(prev => prev.map(s => s.id === activeSpline.id ? { ...s, profile: { ...s.profile, [key]: value } } : s));
  };

  const toggleVisibility = (id: string) => {
    setSplines(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };

  const addNewRoad = () => {
    const ns = createDefaultSpline();
    ns.name = `Road ${splines.length + 1}`;
    setSplines(prev => [...prev, ns]);
    setActiveSplineId(ns.id);
    setSelectedNodeId(null);
    setMode('draw');
  };

  const deleteSpline = (id: string) => {
    setSplines(prev => prev.filter(s => s.id !== id));
    if (activeSplineId === id) setActiveSplineId(null);
  };

  return (
    <div className="shell">
      {/* Outliner - Slate Style */}
      <aside className="outliner">
        <div className="brand">
          <div className="brand-symbol"><Layers size={14} /></div>
          <span>frontier<span className="brand-dot">.</span></span>
          <span className="version">ROADNET / 03</span>
        </div>

        <div className="scene-label">WORKSPACE <span className="status-dot" /></div>
        <div className="scene-title">Road & Bridge<span className="scene-extension">.scene</span></div>

        <div className="outliner-heading">
          <h2>Outliner <span>{splines.length.toString().padStart(2, '0')}</span></h2>
          <button className="icon-button" onClick={addNewRoad} title="New Road (Shift+A)"><Plus size={14} /></button>
        </div>

        <label className="search">
          <Search size={13} />
          <input placeholder="Find roads, bridges..." value={search} onChange={e => setSearch(e.target.value)} />
          {search ? <button onClick={() => setSearch('')}><X size={12} /></button> : <span style={{ fontSize: 14, color: '#444' }}>⌕</span>}
        </label>

        <div className="group">
          <button className="group-label" onClick={() => setCollapsed(c => ({ ...c, roads: !c.roads }))}>
            {collapsed.roads ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            Roads & Bridges
            <span className="group-count">{filteredSplines.length}</span>
          </button>
          {!collapsed.roads && (
            <div>
              {filteredSplines.map(s => (
                <div key={s.id} className={`tree-row ${s.id === activeSplineId ? 'selected' : ''}`}>
                  <button className="object-button" onClick={() => { setActiveSplineId(s.id); setMode('select'); }}>
                    <div className="object-icon-dot" style={{ background: s.profile.isBridge ? '#6aa9ff' : '#888' }} />
                    {s.profile.isBridge ? <Landmark size={14} /> : <Route size={14} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ fontSize: 9, color: '#555', marginLeft: 4 }}>{s.nodes.length}pts</span>
                    {s.id === activeSplineId && <div className="selected-dot" />}
                  </button>
                  <button className="visibility" onClick={() => toggleVisibility(s.id)}>
                    {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
              ))}
              {filteredSplines.length === 0 && <div className="muted" style={{ padding: '8px 14px', textAlign: 'center' }}>No roads</div>}
            </div>
          )}
        </div>

        <div className="group">
          <button className="group-label" onClick={() => setCollapsed(c => ({ ...c, features: !c.features }))}>
            {collapsed.features ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            Generation
            <span className="group-count">FIXES</span>
          </button>
          {!collapsed.features && (
            <div style={{ padding: '0 8px' }}>
              <div className="card" style={{ padding: 12 }}>
                <div className="toggle-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={12} /> Fixed Pavement & Curbs</span>
                  <div className={`toggle ${showPavementFix ? 'on' : ''}`} onClick={() => setShowPavementFix(!showPavementFix)}><span /></div>
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 9, lineHeight: 1.5 }}>
                  Miter joins + offset intersection. No gaps on curves. Curb extruded continuously.
                </div>
                <div className="toggle-row" style={{ marginTop: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Landmark size={12} /> Bridge Auto-Detect</span>
                  <div className={`toggle ${bridgeMode ? 'on' : ''}`} onClick={() => setBridgeMode(!bridgeMode)}><span /></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="outliner-bottom">
          <div className="world-icon"><Mountain size={16} /></div>
          <div><strong>Frontier Valley</strong><span>Roadnet Project · Clean Topology</span></div>
          <span className="little-dot" />
        </div>
      </aside>

      {/* Viewport */}
      <main className="viewport">
        <div className="viewport-top">
          <div className="viewport-top-left">
            <Box size={14} />
            <span>Scene</span>
            <span style={{ color: '#444' }}>/</span>
            <span style={{ color: '#ccc' }}>{activeSpline?.name || 'No selection'}</span>
            <span style={{ color: '#555', fontSize: 9, border: '1px solid #2a2a2a', borderRadius: 4, padding: '1px 5px' }}>{splines.length} splines</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="save-status saved"><span className="status-dot" /> Clean topology · Pavement fixed</div>
            <div className="mode-pill">
              <div className={`mode-dot ${mode}`} />
              {mode} MODE
            </div>
          </div>
        </div>

        <div className="viewport-canvas">
          <Canvas camera={{ position: [0, 60, 40], fov: 45 }} shadows>
            <color attach="background" args={['#0e0e0e']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[20, 40, 20]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
            <directionalLight position={[-20, 20, -20]} intensity={0.4} />
            <Grid infiniteGrid fadeDistance={200} sectionColor="#2a2a2a" cellColor="#1a1a1a" sectionSize={10} cellSize={2} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onPointerDown={handlePlaneClick}>
              <planeGeometry args={[1000, 1000]} />
              <meshBasicMaterial visible={false} />
            </mesh>

            <RoadNetwork splines={splines} />

            <SplineEditor
              splines={splines}
              activeSplineId={activeSplineId}
              selectedNodeId={selectedNodeId}
              mode={mode}
              onNodeClick={handleNodeClick}
              onNodeUpdate={updateNode}
              onSplineUpdate={updateSplinePosition}
              onSplinePoints={p => p}
            />

            <OrbitControls
              makeDefault
              enabled={mode === 'pan' || mode === 'select'}
              enableDamping
              dampingFactor={0.1}
              minDistance={5}
              maxDistance={300}
              mouseButtons={mode === 'pan' ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
            />
          </Canvas>
        </div>

        {/* Toolbar - Slate style */}
        <div className="toolbar">
          <button className={`tool-btn ${mode === 'select' ? 'active' : ''}`} onClick={() => setMode('select')} title="Select (V)"><MousePointer2 size={18} /></button>
          <button className={`tool-btn ${mode === 'draw' ? 'active' : ''}`} onClick={() => { setMode('draw'); setActiveSplineId(null); setSelectedNodeId(null); }} title="Draw Road (P)"><PenTool size={18} /></button>
          <button className={`tool-btn ${mode === 'bridge' ? 'active' : ''}`} onClick={() => setMode('bridge')} title="Bridge Tool (B)"><Landmark size={18} /></button>
          <button className={`tool-btn ${mode === 'elevate' ? 'active' : ''}`} onClick={() => setMode('elevate')} title="Elevation (E)"><MoveUpRight size={18} /></button>
          <div className="tool-sep" />
          <button className="tool-btn" onClick={() => setMode('pan')} title="Pan / Orbit"><Hand size={18} /></button>
          <div style={{ flex: 1 }} />
          <button className="tool-btn" onClick={addNewRoad} title="New Road"><Plus size={18} /></button>
          <button className="tool-btn" onClick={() => setSplines([])} title="Clear All"><Trash2 size={18} /></button>
        </div>

        <div className="viewport-info">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ruler size={12} /> Clean topology: miter joins, no gaps</span>
          <div className="sep" />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Building2 size={12} /> Bridges: pillars, girders, deck</span>
          <div className="sep" />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Hammer size={12} /> Curbs: continuous extrusion on curves</span>
        </div>
      </main>

      {/* Inspector - Slate Style */}
      <aside className="inspector">
        <div className="inspector-top">
          <div className="inspector-top-left"><Settings size={14} /> Properties</div>
          <div className="save-status"><span className="status-dot" /> Realtime</div>
        </div>

        <div className="inspector-content">
          {!activeSpline ? (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <Route size={32} style={{ color: '#333', marginBottom: 12 }} />
              <div style={{ fontSize: 13, color: '#777', marginBottom: 6 }}>No road selected</div>
              <div className="muted">Select a road from outliner or draw a new one. Use Bridge tool for elevated sections.</div>
              <button onClick={addNewRoad} style={{ marginTop: 16, background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 14px', fontSize: 11, color: '#aaa' }}>+ New Road</button>
            </div>
          ) : (
            <>
              <div className="object-header">
                <div className="object-icon-large" style={{ color: activeSpline.profile.isBridge ? '#6aa9ff' : '#aaa' }}>
                  {activeSpline.profile.isBridge ? <Landmark size={24} /> : <Route size={24} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="eyebrow">{activeSpline.profile.isBridge ? 'Bridge structure' : 'Road spline'} · {activeSpline.nodes.length} points</div>
                  <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSpline.name}</h1>
                  <p>{activeSpline.closed ? 'Closed loop' : 'Open spline'} · {activeSpline.profile.isBridge ? 'Elevated' : 'Ground'} · Fixed curbs</p>
                </div>
                <div className="object-actions">
                  <button className="reset-btn" onClick={() => deleteSpline(activeSpline.id)}><Trash2 size={12} /> Delete</button>
                </div>
              </div>

              <div className="cards">
                {/* Road Profile */}
                <div className="card">
                  <div className="card-heading"><span><SlidersHorizontal size={14} /> Road Profile</span><span style={{ fontSize: 9, color: '#555' }}>CLEAN TOPO</span></div>
                  <div className="control-line"><span>Road Width</span><strong>{activeSpline.profile.roadWidth.toFixed(1)} m</strong></div>
                  <input type="range" min={4} max={16} step={0.5} value={activeSpline.profile.roadWidth} onChange={e => updateProfile('roadWidth', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${(activeSpline.profile.roadWidth - 4) / 12 * 100}%` }} />
                  <div className="range-labels"><span>Narrow</span><span>Highway</span></div>

                  <div className="control-line" style={{ marginTop: 16 }}><span>Lanes</span><strong>{activeSpline.profile.laneCount}</strong></div>
                  <input type="range" min={1} max={4} step={1} value={activeSpline.profile.laneCount} onChange={e => updateProfile('laneCount', parseInt(e.target.value))} style={{ ['--progress' as any]: `${(activeSpline.profile.laneCount - 1) / 3 * 100}%` }} />

                  <div className="control-line" style={{ marginTop: 16 }}><span>Elevation</span><strong>{activeSpline.profile.elevation.toFixed(1)} m</strong></div>
                  <input type="range" min={0} max={12} step={0.5} value={activeSpline.profile.elevation} onChange={e => updateProfile('elevation', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${activeSpline.profile.elevation / 12 * 100}%` }} />
                  <div className="range-labels"><span>Ground</span><span>Bridge height</span></div>
                </div>

                {/* Pavement & Curbs - FIXED */}
                <div className="card" style={{ borderColor: showPavementFix ? '#3a3a3a' : '#2a2a2a' }}>
                  <div className="card-heading"><span><Building2 size={14} /> Pavement & Curbs</span><span style={{ fontSize: 8, background: showPavementFix ? '#2a5a2a' : '#2a2a2a', border: '1px solid #333', borderRadius: 10, padding: '2px 6px', color: showPavementFix ? '#7aC07a' : '#666' }}>{showPavementFix ? 'FIXED' : 'LEGACY'}</span></div>
                  <div className="muted" style={{ marginBottom: 12 }}>Miter joins with offset intersection. No self-intersection on tight curves. Continuous curb wall.</div>

                  <div className="control-line"><span>Left Pavement</span><strong>{activeSpline.profile.paveLeft.toFixed(1)} m</strong></div>
                  <input type="range" min={0} max={4} step={0.2} value={activeSpline.profile.paveLeft} onChange={e => updateProfile('paveLeft', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${activeSpline.profile.paveLeft / 4 * 100}%` }} />

                  <div className="control-line" style={{ marginTop: 12 }}><span>Right Pavement</span><strong>{activeSpline.profile.paveRight.toFixed(1)} m</strong></div>
                  <input type="range" min={0} max={4} step={0.2} value={activeSpline.profile.paveRight} onChange={e => updateProfile('paveRight', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${activeSpline.profile.paveRight / 4 * 100}%` }} />

                  <div className="control-line" style={{ marginTop: 12 }}><span>Curb Height</span><strong>{(activeSpline.profile.curbHeight * 100).toFixed(0)} cm</strong></div>
                  <input type="range" min={0.05} max={0.35} step={0.02} value={activeSpline.profile.curbHeight} onChange={e => updateProfile('curbHeight', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${(activeSpline.profile.curbHeight - 0.05) / 0.3 * 100}%` }} />
                </div>

                {/* Bridge */}
                <div className="card" style={{ borderColor: activeSpline.profile.isBridge ? '#2a4a6a' : '#2a2a2a' }}>
                  <div className="card-heading"><span><Landmark size={14} /> Bridge System</span><div className={`toggle ${activeSpline.profile.isBridge ? 'on' : ''}`} onClick={() => updateProfile('isBridge', !activeSpline.profile.isBridge)}><span /></div></div>
                  <div className="muted" style={{ marginBottom: 12 }}>Generates deck, girders, side walls, pillars at intervals. Auto-detects elevation &gt;2m.</div>

                  <div className="control-line"><span>Deck Depth</span><strong>{activeSpline.profile.bridgeDepth.toFixed(2)} m</strong></div>
                  <input type="range" min={0.5} max={3} step={0.1} value={activeSpline.profile.bridgeDepth} onChange={e => updateProfile('bridgeDepth', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${(activeSpline.profile.bridgeDepth - 0.5) / 2.5 * 100}%` }} />

                  <div className="control-line" style={{ marginTop: 12 }}><span>Pillar Spacing</span><strong>{activeSpline.profile.bridgePillarSpacing.toFixed(0)} m</strong></div>
                  <input type="range" min={8} max={30} step={1} value={activeSpline.profile.bridgePillarSpacing} onChange={e => updateProfile('bridgePillarSpacing', parseFloat(e.target.value))} style={{ ['--progress' as any]: `${(activeSpline.profile.bridgePillarSpacing - 8) / 22 * 100}%` }} />

                  <div style={{ marginTop: 12, padding: 10, background: '#1a1a1a', borderRadius: 8, border: '1px solid #222' }}>
                    <div style={{ fontSize: 9, color: '#666', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>Bridge Features</div>
                    <div style={{ display: 'grid', gap: 4, fontSize: 10, color: '#777' }}>
                      <div>• Side walls with inset ({activeSpline.profile.bridgeDepth}m)</div>
                      <div>• 3 longitudinal girders</div>
                      <div>• Pillars every {activeSpline.profile.bridgePillarSpacing}m</div>
                      <div>• Guard rails on deck edges</div>
                      <div>• Footings at ground level</div>
                    </div>
                  </div>
                </div>

                {/* Node */}
                {selectedNode && (
                  <div className="card">
                    <div className="card-heading"><span><CircleDot size={14} /> Node</span><span style={{ fontSize: 9, color: '#555' }}>{selectedNode.id}</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis}>
                          <div style={{ fontSize: 8, color: '#555', marginBottom: 4, letterSpacing: 1 }}>{axis}</div>
                          <div style={{ background: '#151515', border: '1px solid #222', borderRadius: 6, padding: '6px 8px', fontSize: 11, fontFamily: 'JetBrains Mono', color: '#aaa', textAlign: 'center' }}>{selectedNode.position[i].toFixed(1)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>Drag gizmo to move. Handles control curvature. Pavement follows curve via miter joins.</div>
                  </div>
                )}

                {/* Info */}
                <div className="card">
                  <div className="card-heading"><span><Sparkles size={14} /> Topology Notes</span></div>
                  <div style={{ fontSize: 10, color: '#777', lineHeight: 1.6 }}>
                    <div style={{ marginBottom: 8 }}><strong style={{ color: '#aaa' }}>Clean topology:</strong> Uniform resampling + Frenet frames. Road mesh is quad strips, no T-junctions.</div>
                    <div style={{ marginBottom: 8 }}><strong style={{ color: '#aaa' }}>Pavement fix:</strong> Offset polyline via line intersection, miter limited to 3.5×. No gaps on 90° curves.</div>
                    <div><strong style={{ color: '#aaa' }}>Curb fix:</strong> Continuous vertical extrusion along offset curve, not per-segment. Handles tight radius &gt;2m.</div>
                  </div>
                </div>
              </div>

              <div className="inspector-footer">
                <span><span className="footer-dot" />Realtime generation · No baking</span>
                <span>{activeSpline.name} / {activeSpline.profile.isBridge ? 'Bridge' : 'Road'}</span>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
