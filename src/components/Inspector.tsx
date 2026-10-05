import React, { useRef } from 'react';
import {
  Route, Landmark, Waypoints, CircleDot, Globe, Layers,
  Fence, Mountain, FolderDown, Download, Upload, FilePlus, Trash2, RotateCcw, Ruler, Move3d, Check,
} from 'lucide-react';
import type { Project, Selection, Spline, RoadPreset } from '../lib/model';
import { PRESET_DEFS } from '../lib/model';
import type { BuiltNetwork } from '../lib/network';
import { countTriangles } from '../lib/roadGeometry';
import { networkToObj, downloadText } from '../lib/exportObj';
import { Section, Divider, Slider, Toggle, Segmented, Select } from './controls';

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
  icon, accent, eyebrow, title, status,
}: {
  icon: React.ReactNode;
  accent: string;
  eyebrow: string;
  title: string;
  status?: string;
}) {
  return (
    <div className="rw-object-header">
      <div className="rw-object-icon" style={{ color: accent }}>{icon}</div>
      <div className="obj-text">
        <small>{eyebrow}</small>
        <h1 title={title}>{title}</h1>
      </div>
      {status && (
        <div className="obj-status"><span className="dot" />{status}</div>
      )}
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

  const splineLength = (s: Spline) =>
    network.spans.filter((sp) => sp.splineId === s.id).reduce((a, sp) => a + sp.length, 0);
  const splineTris = (s: Spline) =>
    network.spans.filter((sp) => sp.splineId === s.id).reduce((a, sp) => a + countTriangles(sp.patches), 0);
  const setCross = (id: string, patch: Partial<Spline['cross']>) =>
    props.updateSpline(id, (s) => ({ ...s, cross: { ...s.cross, ...patch } }));
  const setBridge = (id: string, patch: Partial<Spline['bridge']>) =>
    props.updateSpline(id, (s) => ({ ...s, bridge: { ...s.bridge, ...patch } }));
  const setRails = (id: string, patch: Partial<Spline['rails']>) =>
    props.updateSpline(id, (s) => ({ ...s, rails: { ...s.rails, ...patch } }));

  const exportObj = () => {
    const text = networkToObj(network, project.name);
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
    <aside className="rw-inspector">
      {/* ------------------------------- SPLINE ------------------------------- */}
      {spline && selection.kind === 'spline' && (
        <>
          <Header
            icon={spline.bridge.enabled ? <Landmark size={20} /> : <Route size={20} />}
            accent={spline.color}
            eyebrow={spline.bridge.enabled ? (spline.bridge.type === 'arch' ? 'ARCH BRIDGE' : 'BEAM BRIDGE') : 'ROAD SPLINE'}
            title={spline.name}
            status={spline.visible ? 'Live' : 'Hidden'}
          />
          <div className="rw-inspector-scroll">
            <Section title="Alignment" icon={<Ruler size={14} />}>
              <div className="rw-metric"><span>{splineLength(spline).toFixed(1)}</span><small>m</small></div>
              <p className="rw-muted">{spline.nodes.length} control nodes · {(splineTris(spline) / 1000).toFixed(1)}k tris</p>
              <Divider />
              <Toggle
                label="Closed loop"
                hint="Join the last node back to the first"
                value={spline.closed}
                onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, closed: v }))}
              />
              <Toggle
                label="Visible"
                value={spline.visible}
                onChange={(v) => props.updateSpline(spline.id, (s) => ({ ...s, visible: v }))}
              />
            </Section>

            <Section title="Cross-section" icon={<Layers size={14} />}>
              <Select
                label="Road preset"
                value={spline.cross.preset}
                options={[
                  ...Object.entries(PRESET_DEFS).map(([value, d]) => ({ value, label: `${d.label} · ${d.width} m` })),
                  { value: 'custom', label: 'Custom' },
                ]}
                onChange={(v) => {
                  const preset = v as RoadPreset;
                  if (preset === 'custom') { setCross(spline.id, { preset }); return; }
                  const d = PRESET_DEFS[preset as keyof typeof PRESET_DEFS];
                  setCross(spline.id, { preset, width: d.width, lanes: d.lanes });
                }}
              />
              <Slider label="Carriageway" unit=" m" min={3} max={24} step={0.5} value={spline.cross.width}
                onChange={(v) => setCross(spline.id, { width: v, preset: 'custom' })} />
              <Slider label="Lanes" min={1} max={6} step={1} value={spline.cross.lanes}
                onChange={(v) => setCross(spline.id, { lanes: v })} />
              <Slider label="Pavement · left" unit=" m" min={0} max={5} step={0.1} value={spline.cross.paveLeft}
                onChange={(v) => setCross(spline.id, { paveLeft: v })} />
              <Slider label="Pavement · right" unit=" m" min={0} max={5} step={0.1} value={spline.cross.paveRight}
                onChange={(v) => setCross(spline.id, { paveRight: v })} />
              <Slider label="Curb height" unit=" m" min={0} max={0.4} step={0.01} value={spline.cross.curbHeight}
                onChange={(v) => setCross(spline.id, { curbHeight: v })} />
              <Slider label="Pavement crossfall" unit=" %" min={0} max={6} step={0.5} value={spline.cross.crossfall * 100}
                onChange={(v) => setCross(spline.id, { crossfall: v / 100 })} />
            </Section>

            <Section title="Markings" open={false}>
              <Toggle label="Centre line" value={spline.cross.showCenterLine}
                onChange={(v) => setCross(spline.id, { showCenterLine: v })} />
              <Toggle label="Edge lines" value={spline.cross.showEdgeLines}
                onChange={(v) => setCross(spline.id, { showEdgeLines: v })} />
              <Toggle label="Lane dividers" value={spline.cross.showLaneLines}
                onChange={(v) => setCross(spline.id, { showLaneLines: v })} />
            </Section>

            <Section title="Structure" icon={<Landmark size={14} />}>
              <Toggle
                label="Bridge"
                hint="Elevate this spline on piers & abutments"
                value={spline.bridge.enabled}
                onChange={(v) => setBridge(spline.id, { enabled: v })}
              />
              {spline.bridge.enabled && (
                <>
                  <Divider />
                  <Segmented
                    label="Bridge type"
                    value={spline.bridge.type}
                    onChange={(v) => setBridge(spline.id, { type: v })}
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
                        onChange={(v) => setBridge(spline.id, { superstructure: v })}
                        options={[
                          { value: 'slab', label: 'Slab' },
                          { value: 'igirder', label: 'I-girder' },
                          { value: 'box', label: 'Box' },
                        ]}
                      />
                      {spline.bridge.superstructure !== 'slab' && (
                        <Slider label="Girder depth" unit=" m" min={0.3} max={3} step={0.1} value={spline.bridge.girderDepth}
                          onChange={(v) => setBridge(spline.id, { girderDepth: v })} />
                      )}
                      {spline.bridge.superstructure === 'igirder' && (
                        <Toggle
                          label="Diaphragms"
                          hint="Transverse braces between girders at supports"
                          value={spline.bridge.diaphragms}
                          onChange={(v) => setBridge(spline.id, { diaphragms: v })}
                        />
                      )}
                      <Divider />
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
                        onChange={(v) => setBridge(spline.id, { pierStyle: v as any })}
                      />
                      <Slider label="Pier spacing" unit=" m" min={4} max={30} step={0.5} value={spline.bridge.pierSpacing}
                        onChange={(v) => setBridge(spline.id, { pierSpacing: v })} />
                      <Slider label="Pier size" unit=" m" min={0.3} max={2} step={0.05} value={spline.bridge.pierSize}
                        onChange={(v) => setBridge(spline.id, { pierSize: v })} />
                      <Segmented
                        label="Column shape"
                        value={spline.bridge.columnShape}
                        onChange={(v) => setBridge(spline.id, { columnShape: v })}
                        options={[
                          { value: 'square', label: 'Square' },
                          { value: 'round', label: 'Round' },
                        ]}
                      />
                      <Segmented
                        label="Foundation"
                        value={spline.bridge.foundation}
                        onChange={(v) => setBridge(spline.id, { foundation: v })}
                        options={[
                          { value: 'spread', label: 'Spread' },
                          { value: 'piles', label: 'Piles' },
                        ]}
                      />
                      <Divider />
                      <Select
                        label="Abutment"
                        value={spline.bridge.abutment}
                        options={[
                          { value: 'cantilever', label: 'Full-height cantilever' },
                          { value: 'stub', label: 'Stub' },
                          { value: 'spill', label: 'Spill-through' },
                        ]}
                        onChange={(v) => setBridge(spline.id, { abutment: v as any })}
                      />
                    </>
                  ) : (
                    <Slider label="Arch rise" unit=" m" min={1.5} max={12} step={0.1} value={spline.bridge.archRise}
                      onChange={(v) => setBridge(spline.id, { archRise: v })} />
                  )}
                  <Slider label="Deck depth" unit=" m" min={0.2} max={1} step={0.05} value={spline.bridge.deckDepth}
                    onChange={(v) => setBridge(spline.id, { deckDepth: v })} />
                  <Segmented
                    label="Edge protection"
                    value={spline.bridge.parapet}
                    onChange={(v) => setBridge(spline.id, { parapet: v })}
                    options={[
                      { value: 'parapet', label: 'Parapet' },
                      { value: 'rail', label: 'Guardrail' },
                    ]}
                  />
                  {spline.bridge.parapet === 'parapet' && (
                    <Slider label="Parapet height" unit=" m" min={0.6} max={1.6} step={0.05} value={spline.bridge.parapetHeight}
                      onChange={(v) => setBridge(spline.id, { parapetHeight: v })} />
                  )}
                </>
              )}
            </Section>

            <Section title="Guardrails" icon={<Fence size={14} />} open={spline.rails.enabled}>
              <Toggle label="Enabled" value={spline.rails.enabled}
                onChange={(v) => setRails(spline.id, { enabled: v })} />
              {spline.rails.enabled && (
                <>
                  <Slider label="Rail height" unit=" m" min={0.3} max={1.4} step={0.05} value={spline.rails.height}
                    onChange={(v) => setRails(spline.id, { height: v })} />
                  <Toggle label="Posts" hint={`${spline.rails.postSpacing.toFixed(1)} m spacing`}
                    value={spline.rails.posts}
                    onChange={(v) => setRails(spline.id, { posts: v })} />
                </>
              )}
            </Section>

            <button className="rw-btn danger block" onClick={() => props.deleteSpline(spline.id)}>
              <Trash2 size={14} /> Delete spline
            </button>
          </div>
        </>
      )}

      {/* -------------------------------- NODE -------------------------------- */}
      {spline && node && selection.kind === 'node' && (
        <>
          <Header
            icon={<CircleDot size={20} />}
            accent={spline.color}
            eyebrow={`NODE · ${spline.name.toUpperCase()}`}
            title={`Node ${spline.nodes.findIndex((n) => n.id === node.id) + 1}`}
            status="Live"
          />
          <div className="rw-inspector-scroll">
            <Section title="Position" icon={<Move3d size={14} />}>
              <div className="rw-xyz">
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
              <div className="spacer" />
              <Slider label="Height" unit=" m" min={-5} max={25} step={0.1} value={node.position[1]}
                onChange={(v) => props.updateNodeHeight(spline.id, node.id, v)} />
              <p className="rw-muted">Raise nodes above the ground to ramp onto bridges, or lower them into cuttings. Dragging snaps onto nearby nodes and curves.</p>
            </Section>
            <button className="rw-btn block" onClick={() => props.onSelect({ kind: 'spline', splineId: spline.id })}>
              Parent spline
            </button>
            <button className="rw-btn danger block" onClick={() => props.deleteNode(spline.id, node.id)}>
              <Trash2 size={14} /> Delete node
            </button>
          </div>
        </>
      )}

      {/* ------------------------------ JUNCTION ------------------------------ */}
      {junction && selection.kind === 'junction' && (
        <>
          <Header
            icon={<Waypoints size={20} />}
            accent="#93c779"
            eyebrow={junction.kind === 'crossing' ? 'AUTO JUNCTION · CROSSING' : 'AUTO JUNCTION · SHARED'}
            title={junction.topology}
            status="Live"
          />
          <div className="rw-inspector-scroll">
            <Section title="Arms" icon={<Waypoints size={14} />}>
              <div className="rw-metric"><span>{junction.arms.length}</span></div>
              <p className="rw-muted">
                {junction.kind === 'crossing'
                  ? 'Fused where curves cross or touch at grade. Runs trim back and merge into the junction — tune it under Scene → Junctions.'
                  : 'Fused where spline nodes coincide. Runs trim back and merge into the junction — tune it under Scene → Junctions.'}
              </p>
              <Divider />
              {junction.arms.map((a, i) => (
                <button
                  key={i}
                  className="rw-arm-row"
                  onClick={() => props.onSelect({ kind: 'spline', splineId: a.splineId })}
                  title={`Go to ${a.splineName}`}
                >
                  <span className="row-dot" style={{ background: a.color }} />
                  {a.splineName}
                  <small>{a.angleDeg.toFixed(0)}°</small>
                </button>
              ))}
            </Section>
          </div>
        </>
      )}

      {/* -------------------------------- SCENE ------------------------------- */}
      {selection.kind === 'scene' && (
        <>
          <Header
            icon={<Globe size={20} />}
            accent="#b9b9b9"
            eyebrow="PROJECT"
            title={project.name}
            status="Live"
          />
          <div className="rw-inspector-scroll">
            <Section title="Ground & water" icon={<Mountain size={14} />}>
              <Slider label="Ground level" unit=" m" min={-10} max={10} step={0.1} value={project.scene.groundZ}
                onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, groundZ: v } }))} />
              <Toggle label="Ground plane" value={project.scene.showGround}
                onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, showGround: v } }))} />
              <Divider />
              <Slider label="Water level" unit=" m" min={-10} max={10} step={0.1} value={project.scene.waterLevel}
                onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, waterLevel: v } }))} />
              <Toggle label="Water plane" value={project.scene.showWater}
                onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, showWater: v } }))} />
              <Divider />
              <Toggle label="Grid" value={project.scene.showGrid}
                onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, showGrid: v } }))} />
              <Slider label="Draw height" unit=" m" min={-5} max={25} step={0.1} value={project.scene.drawHeight}
                onChange={(v) => props.updateProject((p) => ({ ...p, scene: { ...p.scene, drawHeight: v } }))} />
            </Section>

            <Section title="Junctions" icon={<Waypoints size={14} />}>
              <Slider label="Corner radius" unit=" m" min={2} max={20} step={0.5} value={project.junctions.cornerRadius}
                onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, cornerRadius: v } }))} />
              <Slider label="Fillet steps" min={4} max={24} step={1} value={project.junctions.filletSteps}
                onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, filletSteps: v } }))} />
              <Slider label="Structure depth" unit=" m" min={0.5} max={4} step={0.1} value={project.junctions.depth}
                onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, depth: v } }))} />
              <Slider label="Structure inset" unit=" m" min={0} max={3} step={0.1} value={project.junctions.inset}
                onChange={(v) => props.updateProject((p) => ({ ...p, junctions: { ...p.junctions, inset: v } }))} />
            </Section>

            <Section title="Project" icon={<FolderDown size={14} />}>
              <div className="rw-btn-row">
                <button className="rw-btn" onClick={exportObj} title="Export generated meshes as Wavefront OBJ">
                  <Download size={14} /> OBJ
                </button>
                <button className="rw-btn" onClick={exportJson} title="Export project as JSON">
                  <Download size={14} /> JSON
                </button>
                <button className="rw-btn" onClick={() => fileRef.current?.click()} title="Import project JSON">
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
              <div className="rw-btn-row">
                <button className="rw-btn" onClick={() => props.onNewProject(false)}>
                  <FilePlus size={14} /> New empty
                </button>
                <button className="rw-btn" onClick={() => props.onNewProject(true)}>
                  <RotateCcw size={14} /> Demo scene
                </button>
              </div>
              <p className="rw-muted">OBJ export contains every generated road, junction and bridge mesh.</p>
            </Section>
          </div>
        </>
      )}

      <div className="rw-inspector-footer">
        <button className="rw-btn primary block" onClick={props.onSave} disabled={saved} title="Save to browser (Ctrl+S)">
          <Check size={14} /> {saved ? 'All changes saved' : 'Save changes'}
        </button>
        <div className="foot-meta">
          <span className="footer-dot" /> RoadWorks Editor
          <span className="right">{network.junctions.length} junctions · {network.spans.length} spans</span>
        </div>
      </div>
    </aside>
  );
}
