import React, { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { Project, Selection, Spline, RoadPreset, PavingPattern, DrainageStyle } from '../lib/model';
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

function Header({ type, color, title }: { type: string; color: string; title: string }) {
  return (
    <div className="fw-objhead">
      <div className="type"><span className="chip" style={{ background: color }} />{type}</div>
      <h1 title={title}>{title}</h1>
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
  const setPaving = (id: string, patch: Partial<Spline['paving']>) =>
    props.updateSpline(id, (s) => ({ ...s, paving: { ...s.paving, ...patch } }));
  const setDrain = (id: string, patch: Partial<Spline['drainage']>) =>
    props.updateSpline(id, (s) => ({ ...s, drainage: { ...s.drainage, ...patch } }));
  const setBridge = (id: string, patch: Partial<Spline['bridge']>) =>
    props.updateSpline(id, (s) => ({ ...s, bridge: { ...s.bridge, ...patch } }));
  const setRails = (id: string, patch: Partial<Spline['rails']>) =>
    props.updateSpline(id, (s) => ({ ...s, rails: { ...s.rails, ...patch } }));

  const exportObj = () => {
    try {
      const text = networkToObj(network, project.name);
      downloadText(`${project.name.replace(/[^A-Za-z0-9-_]+/g, '_')}.obj`, text, 'text/plain');
    } catch (e) {
      console.error(e);
      window.alert('OBJ export failed — see console.');
    }
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
      try { props.onLoadProject(JSON.parse(String(reader.result))); }
      catch { window.alert('Could not parse that project file.'); }
    };
    reader.readAsText(file);
  };

  const totalTris = network.spans.reduce((a, sp) => a + countTriangles(sp.patches), 0)
    + network.junctions.reduce((a, j) => a + countTriangles(j.patches), 0);

  return (
    <aside className="fw-inspector">
      {/* ------------------------------- SPLINE ------------------------------- */}
      {spline && selection.kind === 'spline' && (
        <>
          <Header
            type={spline.bridge.enabled ? (spline.bridge.type === 'arch' ? 'ARCH BRIDGE' : 'BEAM BRIDGE') : 'ROAD SPLINE'}
            color={spline.color}
            title={spline.name}
          />
          <div className="fw-scroll">
            <Section title="Alignment">
              <div className="fw-metric"><span>{splineLength(spline).toFixed(1)}</span><small>m · {(splineTris(spline)/1000).toFixed(1)}k tris</small></div>
              <p className="fw-muted">{spline.nodes.length} control nodes · {spline.closed ? 'closed loop' : 'open'}</p>
              <Divider />
              <div className="fw-xyz">
                <span style={{ fontSize: 11, color: 'var(--txdim)' }}>Nodes</span>
                <span style={{ font: '11px var(--mono)', marginLeft:'auto' }}>{spline.nodes.length}</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="fw-btn" style={{ flex:1 }} onClick={() => props.updateSpline(spline.id, (s)=> ({...s, closed: !s.closed}))}>
                  {spline.closed ? 'Open loop' : 'Close loop'}
                </button>
                <button className="fw-btn" style={{ flex:1 }} onClick={() => props.updateSpline(spline.id,(s)=> ({...s, visible: !s.visible}))}>
                  {spline.visible ? 'Hide' : 'Show'}
                </button>
              </div>
            </Section>

            <Section title="Road section">
              <Select
                label="Preset"
                value={spline.cross.preset}
                onChange={(v) => {
                  const preset = v as RoadPreset;
                  if (preset === 'custom') setCross(spline.id, { preset });
                  else {
                    const d = PRESET_DEFS[preset as Exclude<RoadPreset,'custom'>];
                    setCross(spline.id, { preset, width: d.width, lanes: d.lanes });
                  }
                }}
                options={[
                  { value: 'single', label: 'Single (6 m)' },
                  { value: 'two-lane', label: '2-lane (8 m)' },
                  { value: 'three-lane', label: '3-lane (12 m)' },
                  { value: 'four-lane', label: '4-lane (16 m)' },
                  { value: 'highway', label: 'Highway (20 m)' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
              <Slider label="Width" unit=" m" min={3} max={24} step={0.5} value={spline.cross.width} onChange={(v) => setCross(spline.id, { width: v })} />
              <Slider label="Lanes" min={1} max={5} step={1} value={spline.cross.lanes} onChange={(v) => setCross(spline.id, { lanes: Math.round(v) })} />
              <Divider />
              <Slider label="Pavement left" unit=" m" min={0} max={5} step={0.25} value={spline.cross.paveLeft} onChange={(v) => setCross(spline.id, { paveLeft: v })} />
              <Slider label="Pavement right" unit=" m" min={0} max={5} step={0.25} value={spline.cross.paveRight} onChange={(v) => setCross(spline.id, { paveRight: v })} />
              <Slider label="Curb height" unit=" m" min={0} max={0.4} step={0.02} value={spline.cross.curbHeight} onChange={(v) => setCross(spline.id, { curbHeight: v })} />
              <Slider label="Crossfall" unit=" %" min={0} max={6} step={0.5} value={spline.cross.crossfall*100} onChange={(v) => setCross(spline.id, { crossfall: v/100 })} />
              <Divider />
              <Toggle label="Center line" value={spline.cross.showCenterLine} onChange={(v)=> setCross(spline.id,{showCenterLine:v})} />
              <Toggle label="Edge lines" value={spline.cross.showEdgeLines} onChange={(v)=> setCross(spline.id,{showEdgeLines:v})} />
              <Toggle label="Lane dividers" value={spline.cross.showLaneLines} onChange={(v)=> setCross(spline.id,{showLaneLines:v})} />
            </Section>

            <Section title="Paving pattern">
              <Select
                label="Pattern"
                value={spline.paving.pattern}
                onChange={(v)=> setPaving(spline.id,{ pattern: v as PavingPattern })}
                options={[
                  { value:'plain', label:'Plain asphalt' },
                  { value:'ashlar', label:'Ashlar stone' },
                  { value:'herringbone', label:'Herringbone' },
                  { value:'basket', label:'Basket weave' },
                  { value:'stretcher', label:'Stretcher bond' },
                  { value:'cobble', label:'Cobblestone' },
                  { value:'hex', label:'Hex pavers' },
                  { value:'diag', label:'Diagonal' },
                ]}
              />
              {spline.paving.pattern!=='plain' && (
                <>
                  <Slider label="Tile scale" unit=" m" min={0.25} max={1.2} step={0.05} value={spline.paving.scale} onChange={(v)=> setPaving(spline.id,{scale:v})} />
                  <Slider label="Mortar gap" unit=" cm" min={0.5} max={6} step={0.5} value={spline.paving.gap*100} onChange={(v)=> setPaving(spline.id,{gap:v/100})} />
                  <div className="fw-row" style={{ display:'flex', gap:6 }}>
                    <label style={{ fontSize:11, color:'var(--txdim)', flex:1 }}>Colour A <input type="color" value={spline.paving.colorA} onChange={(e)=> setPaving(spline.id,{colorA:e.target.value})} style={{ width:'100%', height:24, border:0, padding:0, background:'transparent' }} /></label>
                    <label style={{ fontSize:11, color:'var(--txdim)', flex:1 }}>Colour B <input type="color" value={spline.paving.colorB} onChange={(e)=> setPaving(spline.id,{colorB:e.target.value})} style={{ width:'100%', height:24, border:0, padding:0, background:'transparent' }} /></label>
                  </div>
                  <div className="fw-row" style={{ display:'flex', gap:6 }}>
                    <label style={{ fontSize:11, color:'var(--txdim)', flex:1 }}>Mortar <input type="color" value={spline.paving.mortar} onChange={(e)=> setPaving(spline.id,{mortar:e.target.value})} style={{ width:'100%', height:24, border:0, padding:0 }} /></label>
                    <Toggle label="Enabled" value={spline.paving.enabled} onChange={(v)=> setPaving(spline.id,{enabled:v})} />
                  </div>
                  <p className="fw-muted">Paving overlays the pavement slabs (+1.5 cm) with mortar gaps. Use ashlar/herringbone on plazas, cobble on historic streets.</p>
                </>
              )}
            </Section>

            <Section title="Drainage">
              <Toggle label="Enabled" value={spline.drainage.enabled} onChange={(v)=> setDrain(spline.id,{enabled:v})} />
              {spline.drainage.enabled && (
                <>
                  <Segmented label="Style" value={spline.drainage.style} onChange={(v)=> setDrain(spline.id,{style: v as DrainageStyle})} options={[{value:'grated',label:'Grated'},{value:'slotted',label:'Slotted'},{value:'channel',label:'Channel'}]} />
                  <Slider label="Grate spacing" unit=" m" min={3} max={14} step={0.5} value={spline.drainage.grateSpacing} onChange={(v)=> setDrain(spline.id,{grateSpacing:v})} />
                  <Slider label="Channel width" unit=" m" min={0.18} max={0.6} step={0.02} value={spline.drainage.channelWidth} onChange={(v)=> setDrain(spline.id,{channelWidth:v})} />
                  <Slider label="Gutter depth" unit=" cm" min={3} max={16} step={1} value={spline.drainage.gutterDepth*100} onChange={(v)=> setDrain(spline.id,{gutterDepth:v/100})} />
                  <p className="fw-muted">Shallow V-channel tucked against curb + periodic grate/slot inlets. Depth & width follow the pavement crossfall.</p>
                </>
              )}
            </Section>

            <Section title="Bridge">
              <Toggle label="Enabled" value={spline.bridge.enabled} onChange={(v)=> setBridge(spline.id,{enabled:v})} />
              {spline.bridge.enabled && (
                <>
                  <Segmented label="Type" value={spline.bridge.type} onChange={(v)=> setBridge(spline.id,{type: v as any})} options={[{value:'beam',label:'Beam'},{value:'arch',label:'Arch'}]} />
                  <Segmented label="Superstructure" value={spline.bridge.superstructure} onChange={(v)=> setBridge(spline.id,{superstructure: v as any})} options={[{value:'slab',label:'Slab'},{value:'igirder',label:'I-girder'},{value:'box',label:'Box'}]} />
                  <Slider label="Deck depth" unit=" m" min={0.2} max={1} step={0.05} value={spline.bridge.deckDepth} onChange={(v)=> setBridge(spline.id,{deckDepth:v})} />
                  {spline.bridge.superstructure!=='slab' && <Slider label="Girder depth" unit=" m" min={0.5} max={2.2} step={0.1} value={spline.bridge.girderDepth} onChange={(v)=> setBridge(spline.id,{girderDepth:v})} />}
                  <Slider label="Pier spacing" unit=" m" min={6} max={22} step={1} value={spline.bridge.pierSpacing} onChange={(v)=> setBridge(spline.id,{pierSpacing:v})} />
                  <Segmented label="Pier style" value={spline.bridge.pierStyle} onChange={(v)=> setBridge(spline.id,{pierStyle: v as any})} options={[{value:'single',label:'Single'},{value:'bent',label:'Bent'},{value:'wall',label:'Wall'}]} />
                  <Segmented label="Column" value={spline.bridge.columnShape} onChange={(v)=> setBridge(spline.id,{columnShape: v as any})} options={[{value:'round',label:'Round'},{value:'square',label:'Square'}]} />
                  {spline.bridge.type==='arch' && <Slider label="Arch rise" unit=" m" min={1} max={9} step={0.5} value={spline.bridge.archRise} onChange={(v)=> setBridge(spline.id,{archRise:v})} />}
                  <Slider label="Parapet h" unit=" m" min={0.6} max={1.6} step={0.05} value={spline.bridge.parapetHeight} onChange={(v)=> setBridge(spline.id,{parapetHeight:v})} />
                  <Segmented label="Parapet" value={spline.bridge.parapet} onChange={(v)=> setBridge(spline.id,{parapet: v as any})} options={[{value:'parapet',label:'Parapet'},{value:'rail',label:'Guardrail'}]} />
                </>
              )}
            </Section>

            <Section title="Guardrails" open={spline.rails.enabled}>
              <Toggle label="Enabled" value={spline.rails.enabled} onChange={(v)=> setRails(spline.id,{enabled:v})} />
              {spline.rails.enabled && (
                <>
                  <Slider label="Rail height" unit=" m" min={0.3} max={1.4} step={0.05} value={spline.rails.height} onChange={(v)=> setRails(spline.id,{height:v})} />
                  <Toggle label="Posts" hint={`${spline.rails.postSpacing.toFixed(1)} m spacing`} value={spline.rails.posts} onChange={(v)=> setRails(spline.id,{posts:v})} />
                  <Slider label="Post spacing" unit=" m" min={1} max={5} step={0.25} value={spline.rails.postSpacing} onChange={(v)=> setRails(spline.id,{postSpacing:v})} />
                </>
              )}
            </Section>

            <div style={{ padding: '10px 6px' }}>
              <button className="fw-btn danger block" onClick={() => props.deleteSpline(spline.id)}><Trash2 size={14} /> Delete spline</button>
            </div>
          </div>
        </>
      )}

      {/* NODE */}
      {spline && node && selection.kind === 'node' && (
        <>
          <Header type={`NODE · ${spline.name.toUpperCase()}`} color={spline.color} title={`Node ${spline.nodes.findIndex((n) => n.id === node.id) + 1}`} />
          <div className="fw-scroll">
            <Section title="Position">
              <div className="fw-xyz">
                {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                  <div key={axis}>
                    <label>{axis}</label>
                    <input type="number" step={0.5} value={Number(node.position[i]).toFixed(2)} onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      const pos: [number, number, number] = [...node.position] as [number, number, number];
                      pos[i] = v;
                      props.updateNodePosition(spline.id, node.id, pos);
                    }} />
                  </div>
                ))}
              </div>
              <Slider label="Height" unit=" m" min={-5} max={25} step={0.1} value={node.position[1]} onChange={(v) => props.updateNodeHeight(spline.id, node.id, v)} />
              <p className="fw-muted">Raise to ramp onto bridges, lower into cuttings. Drag with gizmo — snaps onto nearby nodes and curves.</p>
            </Section>
            <div style={{ padding: '10px 6px', display:'flex', flexDirection:'column', gap:6 }}>
              <button className="fw-btn block" onClick={() => props.onSelect({ kind: 'spline', splineId: spline.id })}>Parent spline</button>
              <button className="fw-btn danger block" onClick={() => props.deleteNode(spline.id, node.id)}><Trash2 size={14} /> Delete node</button>
            </div>
          </div>
        </>
      )}

      {/* JUNCTION — single-handle joint */}
      {junction && selection.kind === 'junction' && (
        <>
          <Header type={junction.kind==='crossing' ? 'JOINT · CROSSING' : 'JOINT · SHARED'} color="#8a8a8a" title={junction.topology} />
          <div className="fw-scroll">
            <Section title="Joint handle">
              <div className="fw-metric"><span>◆</span><small>single-handle</small></div>
              <p className="fw-muted">Drag the white joint gizmo (both 2D + 3D panes) to move the entire intersection. Every incident road end rides together so geometry stays watertight — no gaps, no re-trim needed.</p>
              <Divider />
              <p className="fw-muted">The joint is not a separate object; its position is the mean of its incident spline endpoints. Moving it translates all those endpoints (and their handles) by the same delta in world space.</p>
            </Section>
            <Section title="Arms">
              <div className="fw-metric"><span>{junction.arms.length}</span><small> roads</small></div>
              <p className="fw-muted">{junction.kind==='crossing' ? 'Fused where curves cross, touch, or land near each other at grade. Runs trim back + merge.' : 'Fused where spline nodes coincide.'}</p>
              <Divider />
              {junction.arms.map((a,i)=>(
                <button key={i} className="fw-arm" onClick={()=> props.onSelect({ kind:'spline', splineId:a.splineId })} title={`Go to ${a.splineName}`}>
                  <span className="chip" style={{ background:a.color }} />{a.splineName}<small>{a.angleDeg.toFixed(0)}°</small>
                </button>
              ))}
            </Section>
            <Section title="Tuning (Scene → Junctions)">
              <p className="fw-muted">Corner radius, fillet steps, depth & inset control the shared fillet arcs and tub walls for all joints. Tune globally under Scene.</p>
            </Section>
          </div>
        </>
      )}

      {/* SCENE */}
      {selection.kind === 'scene' && (
        <>
          <Header type="PROJECT" color="#8a8a8a" title={project.name} />
          <div className="fw-scroll">
            <Section title="Ground & water">
              <Slider label="Ground level" unit=" m" min={-10} max={10} step={0.1} value={project.scene.groundZ} onChange={(v)=> props.updateProject((p)=> ({...p, scene:{...p.scene, groundZ:v}}))} />
              <Toggle label="Ground plane" value={project.scene.showGround} onChange={(v)=> props.updateProject((p)=> ({...p, scene:{...p.scene, showGround:v}}))} />
              <Divider />
              <Slider label="Water level" unit=" m" min={-10} max={10} step={0.1} value={project.scene.waterLevel} onChange={(v)=> props.updateProject((p)=> ({...p, scene:{...p.scene, waterLevel:v}}))} />
              <Toggle label="Water plane" value={project.scene.showWater} onChange={(v)=> props.updateProject((p)=> ({...p, scene:{...p.scene, showWater:v}}))} />
              <Divider />
              <Toggle label="Grid" value={project.scene.showGrid} onChange={(v)=> props.updateProject((p)=> ({...p, scene:{...p.scene, showGrid:v}}))} />
              <Slider label="Draw height" unit=" m" min={-5} max={25} step={0.1} value={project.scene.drawHeight} onChange={(v)=> props.updateProject((p)=> ({...p, scene:{...p.scene, drawHeight:v}}))} />
            </Section>
            <Section title="Junctions (global)">
              <Slider label="Corner radius" unit=" m" min={2} max={20} step={0.5} value={project.junctions.cornerRadius} onChange={(v)=> props.updateProject((p)=> ({...p, junctions:{...p.junctions, cornerRadius:v}}))} />
              <Slider label="Fillet steps" min={4} max={24} step={1} value={project.junctions.filletSteps} onChange={(v)=> props.updateProject((p)=> ({...p, junctions:{...p.junctions, filletSteps:v}}))} />
              <Slider label="Struct depth" unit=" m" min={0.5} max={4} step={0.1} value={project.junctions.depth} onChange={(v)=> props.updateProject((p)=> ({...p, junctions:{...p.junctions, depth:v}}))} />
              <Slider label="Struct inset" unit=" m" min={0} max={3} step={0.1} value={project.junctions.inset} onChange={(v)=> props.updateProject((p)=> ({...p, junctions:{...p.junctions, inset:v}}))} />
              <p className="fw-muted">Corner radius = trim-back + fillet scale. Junctions are built from trimmed span ends — watertight by construction.</p>
            </Section>
            <Section title="Statistics">
              <div className="fw-kv"><span>Spans</span><span>{network.spans.length}</span></div>
              <div className="fw-kv"><span>Junctions</span><span>{network.junctions.length}</span></div>
              <div className="fw-kv"><span>Triangles</span><span>{(totalTris/1000).toFixed(1)}k</span></div>
              <div className="fw-kv"><span>Patches</span><span>{network.spans.reduce((a,s)=>a+s.patches.length,0)+network.junctions.reduce((a,j)=>a+j.patches.length,0)}</span></div>
            </Section>
            <Section title="Exchange (fixed)">
              <div className="fw-btnrow">
                <button className="fw-btn" onClick={exportObj} title="Export generated meshes as Wavefront OBJ (world space)">OBJ</button>
                <button className="fw-btn" onClick={exportJson} title="Export project JSON">JSON</button>
                <button className="fw-btn" onClick={()=> fileRef.current?.click()} title="Import road.json">Import</button>
                <input ref={fileRef} type="file" accept=".json,.road.json,application/json" style={{ display:'none' }} onChange={(e)=>{const f=e.target.files?.[0]; if(f) importJson(f); e.target.value='';}} />
              </div>
              <p className="fw-muted">OBJ contains every road / junction / bridge / paving / drainage mesh in world space with correct vertex winding. JSON round-trips the full project (including paving & drainage).</p>
            </Section>
          </div>
        </>
      )}

      <div className="fw-foot">
        <button className="fw-btn block" onClick={props.onSave} disabled={saved} title="Save to browser (Ctrl+S)">{saved ? 'All changes saved' : 'Save changes'}</button>
        <div className="meta"><span>Frontier Road Designer</span><span className="right">{network.junctions.length} joints · {network.spans.length} spans</span></div>
      </div>
    </aside>
  );
}
