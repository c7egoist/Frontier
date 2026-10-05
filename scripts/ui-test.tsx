// SSR smoke test for the non-WebGL UI (Outliner, Inspector, controls).
import React from 'react';
import { renderToString } from 'react-dom/server';
import { demoProject } from '../src/lib/model';
import { buildNetwork } from '../src/lib/network';
import { Outliner } from '../src/components/Outliner';
import { Inspector } from '../src/components/Inspector';

const project = demoProject();
const network = buildNetwork(project);
const noop = (..._a: any[]) => {};
const updateSpline = (id: string, fn: any) => fn(project.splines[0]);

const outliner = renderToString(
  <Outliner project={project} network={network} selection={{ kind: 'scene' }} menuNonce={0}
    onSelect={noop} onToggleVisibility={noop} onAddSpline={noop} onRename={noop} />,
);
console.log('outliner html:', outliner.length);
if (!outliner.includes('RoadWorks') || !outliner.includes('Shore Road') || !outliner.includes('4-way')) {
  console.error('FAIL: outliner missing content'); process.exitCode = 1;
} else console.log('ok: outliner');

const s = project.splines[0];
const inspectorSpline = renderToString(
  <Inspector project={project} network={network} selection={{ kind: 'spline', splineId: s.id }} saved={false}
    onSave={noop} onSelect={noop} updateSpline={updateSpline} updateProject={noop} deleteSpline={noop}
    deleteNode={noop} updateNodeHeight={noop} updateNodePosition={noop} onLoadProject={noop} onNewProject={noop} />,
);
console.log('inspector(spline) html:', inspectorSpline.length);
if (!inspectorSpline.includes('Cross-section') || !inspectorSpline.includes('Structure')) {
  console.error('FAIL: spline inspector missing cards'); process.exitCode = 1;
} else console.log('ok: inspector spline');

const inspectorNode = renderToString(
  <Inspector project={project} network={network} selection={{ kind: 'node', splineId: s.id, nodeId: s.nodes[0].id }} saved
    onSave={noop} onSelect={noop} updateSpline={updateSpline} updateProject={noop} deleteSpline={noop}
    deleteNode={noop} updateNodeHeight={noop} updateNodePosition={noop} onLoadProject={noop} onNewProject={noop} />,
);
if (!inspectorNode.includes('Position')) { console.error('FAIL: node inspector'); process.exitCode = 1; }
else console.log('ok: inspector node');

const inspectorJ = renderToString(
  <Inspector project={project} network={network} selection={{ kind: 'junction', junctionId: network.junctions[0].id }} saved
    onSave={noop} onSelect={noop} updateSpline={updateSpline} updateProject={noop} deleteSpline={noop}
    deleteNode={noop} updateNodeHeight={noop} updateNodePosition={noop} onLoadProject={noop} onNewProject={noop} />,
);
if (!inspectorJ.includes('Arms')) { console.error('FAIL: junction inspector'); process.exitCode = 1; }
else console.log('ok: inspector junction');

const inspectorScene = renderToString(
  <Inspector project={project} network={network} selection={{ kind: 'scene' }} saved
    onSave={noop} onSelect={noop} updateSpline={updateSpline} updateProject={noop} deleteSpline={noop}
    deleteNode={noop} updateNodeHeight={noop} updateNodePosition={noop} onLoadProject={noop} onNewProject={noop} />,
);
if (!inspectorScene.includes('Ground &amp; water') && !inspectorScene.includes('Ground & water')) { console.error('FAIL: scene inspector'); process.exitCode = 1; }
else console.log('ok: inspector scene');

// bridge spline inspector (beam + arch paths)
const b = project.splines.find((x) => x.bridge.enabled)!;
const inspectorBridge = renderToString(
  <Inspector project={project} network={network} selection={{ kind: 'spline', splineId: b.id }} saved
    onSave={noop} onSelect={noop} updateSpline={updateSpline} updateProject={noop} deleteSpline={noop}
    deleteNode={noop} updateNodeHeight={noop} updateNodePosition={noop} onLoadProject={noop} onNewProject={noop} />,
);
if (!inspectorBridge.includes('Pier spacing') || !inspectorBridge.includes('Guardrails')) { console.error('FAIL: bridge inspector'); process.exitCode = 1; }
else console.log('ok: inspector bridge');

console.log(process.exitCode === 1 ? 'UI TEST: FAILED' : 'UI TEST: PASSED');
