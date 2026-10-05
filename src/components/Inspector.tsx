import React, { useRef } from 'react';
import {
  ChevronRight, Check, Route, Landmark, Waypoints, CircleDot, Globe, Layers, Spline as SplineIcon,
  Fence, Mountain, FolderDown, Download, Upload, FilePlus, Trash2, RotateCcw, Ruler, Move3d,
} from 'lucide-react';
import type { Project, Selection, Spline, RoadPreset } from '../lib/model';
import { PRESET_DEFS } from '../lib/model';
import type { BuiltNetwork } from '../lib/network';
import { countTriangles } from '../lib/roadGeometry';
import { networkToObj, downloadText } from '../lib/exportObj';
import { Card, Slider, Toggle, Segmented, Select } from './controls';

interface InspectorProps {
  project: Project;
  network: BuiltNetwork;
  selection: Selection;
  saved: boolean;
  onSave: () => void;
  onSelect: (s: Selection) => void;
  updateSpline: (id: string, fn: (s: Spline) => Spline) => void;
  updateProject: (fn: (p: Project) => Project) => void;
  deleteSpline: (id: string) => void;
  deleteNode: (splineId: string, nodeId: string) => void;
  updateNodeHeight: (splineId: string, nodeId: string, y: number) => void;
  updateNodePosition: (splineId: string, nodeId: string, pos: [number, number, number]) => void;
  onLoadProject: (p: Project) => void;
  onNewProject: (demo: boolean) => void;
}

function Header({
  icon, accent, eyebrow, title, pill,
}: {
  icon: React.ReactNode;
  accent: string;
  eyebrow: string;
  title: string;
  pill?: React.ReactNode;
}) {
  return (
    <div className="object-header">
      <div className="object-title">
        <div className="object-icon" style={{ '--accent': accent } as React.CSSProperties}>{icon}</div>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 title={title}>{title}</h1>
        </div>
      </div>
      <div className="object-actions">{pill}</div>
    </div>
  );
}

export function Inspector(props: InspectorProps) {
  const { project, network, selection, saved } = props;
  const fileRef = useRef<HTMLInputElement>(null);

  const spline = selection.kind === 'spline' || selection.kind === 'node'
    ? project.splines.find((s) => s.id === selection.splineId) ?? null
    : null;
  const node = selection.kind === 'node' && spline
    ? spline.nodes.find((n) => n.id === selection.nodeId) ?? null
    : null;
  const junction = selection.kind === 'junction'
    ? network.junctions.find((j) => j.id === selection.junctionId) ?? null
    : null;

  const groupName = selection.kind === 'scene'
    ? 'Scene'
    : selection.kind === 'spline' ? 'Splines'
      : selection.kind === 'node' ? 'Splines'
        : 'Junctions';

  const splineLength = (s: Spline) =>
    network.spans.filter((sp) => sp.splineId === s.id).reduce((a, sp) => a + sp.length, 0);
  const splineTris = (s: Spline) =>
    network.spans.filter((sp) => sp.splineId === s.id).reduce((a, sp) => a + countTriangles(sp.patches), 0);

  const exportObj = () => {
    const full = network;
    const text = networkToObj(full, project.name);
    downloadText(`${project.name.replace(/[^A-Za-z0-9-_]+/g, '_')}.obj`, text, 'text/plain');
  };
  const exportJson = () => {
    downloadText(
      `${project.name.replace(/[^A-Za-z0-9-_]+/g, '_')}.road.json`,
      JSON.stringify(project, null, 2),
      'application/json',
    );
  };
  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        props.onLoadProject(JSON.parse(String(reader.result)));
      } catch {
        window.alert('Could not parse that project file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <aside className="inspector">
      <header className="inspector-top">
        <div>
          Inspector <ChevronRight size={13} />
          <span>{groupName}</span>
        </div>
        <button className={`save-status ${saved ? 'saved' : ''}`} onClick={props.onSave} title="Save to browser (Ctrl+S)">
          {saved ? <Check size={13} /> : <span className="unsaved-dot" />}
          {saved ? 'All changes saved' : 'Save changes'}
        </button>
      </header>

      <div className="inspector-content">
        {/* ------------------------------- SPLINE ------------------------------- */}
        {spline && selection.kind === 'spline' && (
          <>
            <Header
              icon={spline.bridge.enabled ? <Landmark size={24} /> : <Route size={24} />}
              accent={spline.color}
              eyebrow={spline.bridge.enabled ? (spline.bridge.type === 'arch' ? 'Arch bridge' : 'Beam bridge') : 'Road spline'}
              title={spline.name}
              pill={(
                <button
                  className={`enabled-pill ${spline.visible ? '' : 'disabled'}`}
                  onClick={() => props.updateSpline(spline.id, (s) => ({ ...s, visible: !s.visible }))}
                >
                  <span />
                  {spline.visible ? 'Enabled' : 'Disabled'}
                </button>
              )}
            />
            <div className="section-label"><span>PROPERTIES</span><span>Alignment &amp; structure</span></div>
            <div className="cards">
              <Card title="Alignment" icon={<Ruler size={16} />} color={spline.color}>
                <div className="metric">
                  <span>{splineLength(spline).toFixed(1)}</span>
                  <small>m</small>
                </div>
                <p className="muted">{spline.nodes.length} control nodes · {(splineTris(spline) / 1000).toFixed(1)}k tris</p>
                <div className="card-divider" />
                <Toggle
                  label="Closed loop"
                  hint="Join the last node back to the first"
                  value={spline.closed}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, closed: v }))}
                />
              </Card>

              <Card title="Cross-section" icon={<Layers size={16} />} color={spline.color}>
                <Select
                  label="Road preset"
                  value={spline.cross.preset}
                  options={[
                    ...Object.entries(PRESET_DEFS).map(([value, d]) => ({ value, label: `${d.label} · ${d.width} m` })),
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(v) => {
                    const preset = v as RoadPreset;
                    props.updateSpline(spline.id, (s) => {
                      if (preset === 'custom') return { ...s, cross: { ...s.cross, preset } };
                      const d = PRESET_DEFS[preset as keyof typeof PRESET_DEFS];
                      return { ...s, cross: { ...s.cross, preset, width: d.width, lanes: d.lanes } };
                    });
                  }}
                />
                <Slider label="Carriageway" unit=" m" min={3} max={24} step={0.5} value={spline.cross.width}
                  accent={spline.color}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, width: v, preset: 'custom' } }))} />
                <Slider label="Lanes" min={1} max={6} step={1} value={spline.cross.lanes}
                  accent={spline.color}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, lanes: v } }))} />
                <Slider label="Pavement · left" unit=" m" min={0} max={5} step={0.1} value={spline.cross.paveLeft}
                  accent={spline.color}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, paveLeft: v } }))} />
                <Slider label="Pavement · right" unit=" m" min={0} max={5} step={0.1} value={spline.cross.paveRight}
                  accent={spline.color}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, paveRight: v } }))} />
                <Slider label="Curb height" unit=" m" min={0} max={0.4} step={0.01} value={spline.cross.curbHeight}
                  accent={spline.color}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, curbHeight: v } }))} />
                <Slider label="Pavement crossfall" unit=" %" min={0} max={6} step={0.5} value={spline.cross.crossfall * 100}
                  accent={spline.color}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, crossfall: v / 100 } }))} />
              </Card>

              <Card title="Markings" icon={<SplineIcon size={16} />} color={spline.color}>
                <Toggle label="Centre line" value={spline.cross.showCenterLine}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, showCenterLine: v } }))} />
                <Toggle label="Edge lines" value={spline.cross.showEdgeLines}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, showEdgeLines: v } }))} />
                <Toggle label="Lane dividers" value={spline.cross.showLaneLines}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, cross: { ...s.cross, showLaneLines: v } }))} />
              </Card>

              <Card title="Structure" icon={<Landmark size={16} />} color={spline.color}>
                <Toggle
                  label="Bridge"
                  hint="Elevate this spline on piers & abutments"
                  value={spline.bridge.enabled}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, enabled: v } }))}
                />
                {spline.bridge.enabled && (
                  <>
                    <div className="card-divider" />
                    <Segmented
                      label="Bridge type"
                      value={spline.bridge.type}
                      onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, type: v } }))}
                      options={[
                        { value: 'beam', label: 'Beam' },
                        { value: 'arch', label: 'Arch' },
                      ]}
                    />
                    {spline.bridge.type === 'beam' ? (
                      <>
                        <Segmented
                          label="Superstructure"
                          value={spline.bridge.superstructure}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, superstructure: v } }))}
                          options={[
                            { value: 'slab', label: 'Slab' },
                            { value: 'igirder', label: 'I-girder' },
                            { value: 'box', label: 'Box' },
                          ]}
                        />
                        {spline.bridge.superstructure !== 'slab' && (
                          <Slider label="Girder depth" unit=" m" min={0.3} max={3} step={0.1} value={spline.bridge.girderDepth}
                            accent={spline.color}
                            onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, girderDepth: v } }))} />
                        )}
                        {spline.bridge.superstructure === 'igirder' && (
                          <Toggle
                            label="Diaphragms"
                            hint="Transverse braces between girders at supports"
                            value={spline.bridge.diaphragms}
                            onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, diaphragms: v } }))}
                          />
                        )}
                        <div className="card-divider" />
                        <Select
                          label="Pier style"
                          value={spline.bridge.pierStyle}
                          options={[
                            { value: 'single', label: 'Single column' },
                            { value: 'bent', label: 'Multi-column bent' },
                            { value: 'wall', label: 'Wall pier' },
                            { value: 'hammerhead', label: 'Hammerhead' },
                            { value: 'portal', label: 'Portal frame' },
                          ]}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, pierStyle: v as any } }))}
                        />
                        <Slider label="Pier spacing" unit=" m" min={4} max={30} step={0.5} value={spline.bridge.pierSpacing}
                          accent={spline.color}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, pierSpacing: v } }))} />
                        <Slider label="Pier size" unit=" m" min={0.3} max={2} step={0.05} value={spline.bridge.pierSize}
                          accent={spline.color}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, pierSize: v } }))} />
                        <Segmented
                          label="Column shape"
                          value={spline.bridge.columnShape}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, columnShape: v } }))}
                          options={[
                            { value: 'square', label: 'Square' },
                            { value: 'round', label: 'Round' },
                          ]}
                        />
                        <Segmented
                          label="Foundation"
                          value={spline.bridge.foundation}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, foundation: v } }))}
                          options={[
                            { value: 'spread', label: 'Spread' },
                            { value: 'piles', label: 'Piles' },
                          ]}
                        />
                        <div className="card-divider" />
                        <Select
                          label="Abutment"
                          value={spline.bridge.abutment}
                          options={[
                            { value: 'cantilever', label: 'Full-height cantilever' },
                            { value: 'stub', label: 'Stub' },
                            { value: 'spill', label: 'Spill-through' },
                          ]}
                          onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, abutment: v as any } }))}
                        />
                      </>
                    ) : (
                      <Slider label="Arch rise" unit=" m" min={1.5} max={12} step={0.1} value={spline.bridge.archRise}
                        accent={spline.color}
                        onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, archRise: v } }))} />
                    )}
                    <Slider label="Deck depth" unit=" m" min={0.2} max={1} step={0.05} value={spline.bridge.deckDepth}
                      accent={spline.color}
                      onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, deckDepth: v } }))} />
                    <Segmented
                      label="Edge protection"
                      value={spline.bridge.parapet}
                      onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, parapet: v } }))}
                      options={[
                        { value: 'parapet', label: 'Parapet' },
                        { value: 'rail', label: 'Guardrail' },
                      ]}
                    />
                    {spline.bridge.parapet === 'parapet' && (
                      <Slider label="Parapet height" unit=" m" min={0.6} max={1.6} step={0.05} value={spline.bridge.parapetHeight}
                        accent={spline.color}
                        onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, bridge: { ...s.bridge, parapetHeight: v } }))} />
                    )}
                  </>
                )}
              </Card>

              <Card title="Guardrails" icon={<Fence size={16} />} color={spline.color}>
                <Toggle label="Enabled" value={spline.rails.enabled}
                  onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, rails: { ...s.rails, enabled: v } }))} />
                {spline.rails.enabled && (
                  <>
                    <Slider label="Rail height" unit=" m" min={0.3} max={1.4} step={0.05} value={spline.rails.height}
                      accent={spline.color}
                      onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, rails: { ...s.rails, height: v } }))} />
                    <Toggle label="Posts" hint={`${spline.rails.postSpacing.toFixed(1)} m spacing`}
                      value={spline.rails.posts}
                      onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, rails: { ...s.rails, posts: v } }))} />
                  </>
                )}
              </Card>

              <button className="btn danger" onClick={() => props.deleteSpline(spline.id)}>
                <Trash2 size={14} /> Delete spline
              </button>
            </div>
          </>
        )}

        {/* -------------------------------- NODE -------------------------------- */}
        {spline && node && selection.kind === 'node' && (
          <>
            <Header
              icon={<CircleDot size={24} />}
              accent={spline.color}
              eyebrow={`Node · ${spline.name}`}
              title={`Node ${spline.nodes.findIndex((n) => n.id === node.id) + 1}`}
              pill={(
                <button className="enabled-pill" onClick={() => props.onSelect({ kind: 'spline', splineId: spline.id })}>
                  Parent
                </button>
              )}
            />
            <div className="section-label"><span>PROPERTIES</span><span>Position</span></div>
            <div className="cards">
              <Card title="Position" icon={<Move3d size={16} />} color={spline.color}>
                <div className="xyz-grid">
                  {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                    <div key={axis}>
                      <label>{axis}</label>
                      <input
                        type="number"
                        step={0.5}
                        value={Number(node.position[i]).toFixed(2)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const pos: [number, number, number] = [...node.position] as [number, number, number];
                          pos[i] = v;
                          props.updateNodePosition(spline.id, node.id, pos);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ height: 12 }} />
                <Slider label="Height" unit=" m" min={-5} max={25} step={0.1} value={node.position[1]}
                  accent={spline.color}
                  onChange={(v) => props.updateNodeHeight(spline.id, node.id, v)} />
                <p className="muted">Raise nodes above the ground to ramp onto bridges, or lower them into cuttings.</p>
              </Card>
              <button className="btn danger" onClick={() => props.deleteNode(spline.id, node.id)}>
                <Trash2 size={14} /> Delete node
              </button>
            </div>
          </>
        )}

        {/* ------------------------------ JUNCTION ------------------------------ */}
        {junction && selection.kind === 'junction' && (
          <>
            <Header
              icon={<Waypoints size={24} />}
              accent="#93c779"
              eyebrow="Auto junction"
              title={junction.topology}
              pill={<span className="enabled-pill"><span />Live</span>}
            />
            <div className="section-label"><span>PROPERTIES</span><span>Generated junction</span></div>
            <div className="cards">
              <Card title="Arms" icon={<Waypoints size={16} />} color="#93c779">
                <div className="metric"><span>{junction.arms.length}</span></div>
                <p className="muted">Junctions are generated where spline nodes coincide. Runs trim back and merge into the junction — tune it under Scene → Junctions.</p>
                <div className="card-divider" />
                <div className="arms-list">
                  {junction.arms.map((a, i) => (
                    <button
                      key={i}
                      className="arm-row"
                      onClick={() => props.onSelect({ kind: 'spline', splineId: a.splineId })}
                      title={`Go to ${a.splineName}`}
                    >
                      <span className="row-dot" style={{ background: a.color }} />
                      {a.splineName}
                      <small>{a.angleDeg.toFixed(0)}°</small>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* -------------------------------- SCENE ------------------------------- */}
        {selection.kind === 'scene' && (
          <>
            <Header
              icon={<Globe size={24} />}
              accent="#b9b9b9"
              eyebrow="Project"
              title={project.name}
              pill={<span className="enabled-pill"><span />Live</span>}
            />
            <div className="section-label"><span>PROPERTIES</span><span>Environment &amp; project</span></div>
            <div className="cards">
              <Card title="Ground & water" icon={<Mountain size={16} />} color="#d6a078">
                <Slider label="Ground level" unit=" m" min={-10} max={10} step={0.1} value={project.scene.groundZ}
                  onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, groundZ: v } }))} />
                <Toggle label="Ground plane" value={project.scene.showGround}
                  onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, showGround: v } }))} />
                <div className="card-divider" />
                <Slider label="Water level" unit=" m" min={-10} max={10} step={0.1} value={project.scene.waterLevel}
                  onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, waterLevel: v } }))} />
                <Toggle label="Water plane" value={project.scene.showWater}
                  onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, showWater: v } }))} />
                <div className="card-divider" />
                <Toggle label="Grid" value={project.scene.showGrid}
                  onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: v } }))} />
                <Slider label="Draw height" unit=" m" min={-5} max={25} step={0.1} value={project.scene.drawHeight}
                  onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, drawHeight: v } }))} />
              </Card>

              <Card title="Junctions" icon={<Waypoints size={16} />} color="#93c779">
                <Slider label="Corner radius" unit=" m" min={2} max={20} step={0.5} value={project.junctions.cornerRadius}
                  onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, cornerRadius: v } }))} />
                <Slider label="Fillet steps" min={4} max={24} step={1} value={project.junctions.filletSteps}
                  onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, filletSteps: v } }))} />
                <Slider label="Structure depth" unit=" m" min={0.5} max={4} step={0.1} value={project.junctions.depth}
                  onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, depth: v } }))} />
                <Slider label="Structure inset" unit=" m" min={0} max={3} step={0.1} value={project.junctions.inset}
                  onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, inset: v } }))} />
              </Card>

              <Card title="Project" icon={<FolderDown size={16} />} color="#b9b9b9">
                <div className="btn-row">
                  <button className="btn" onClick={exportObj} title="Export generated meshes as Wavefront OBJ">
                    <Download size={14} /> OBJ
                  </button>
                  <button className="btn" onClick={exportJson} title="Export project as JSON">
                    <Download size={14} /> JSON
                  </button>
                  <button className="btn" onClick={() => fileRef.current?.click()} title="Import project JSON">
                    <Upload size={14} />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,.road.json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importJson(f);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div style={{ height: 8 }} />
                <div className="btn-row">
                  <button className="btn" onClick={() => props.onNewProject(false)}>
                    <FilePlus size={14} /> New empty
                  </button>
                  <button className="btn" onClick={() => props.onNewProject(true)}>
                    <RotateCcw size={14} /> Demo scene
                  </button>
                </div>
                <p className="muted">OBJ export contains every generated road, junction and bridge mesh.</p>
              </Card>
            </div>
          </>
        )}

        <div className="inspector-footer">
          <span><span className="footer-dot" /> RoadWorks Editor</span>
          <span>{network.junctions.length} junctions · {network.spans.length} spans</span>
        </div>
      </div>
    </aside>
  );
}
