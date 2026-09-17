/**
 * Renders each face of the surface as its own colour on a dense (m, a) grid, so gaps
 * and overlaps in the face layout are obvious. Debug aid for the roof plan.
 */
import { buildRoof } from '../src/core/build-roof.js';
import { PRESETS } from '../src/core/spec.js';
import { renderRoof, frameToPNG, contactSheet, makeFrame, drawMesh, drawGround, camera } from './render.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const name = process.argv[2] ?? 'minka';
const roof = buildRoof(PRESETS[name].spec, { lengthSegments: 3 });
const s = roof.surface;
const COLORS = {
  mainFront: [200, 70, 60], mainBack: [70, 110, 200],
  endPos: [230, 170, 60], endNeg: [90, 180, 90],
};
const parts = [];
for (const face of s.faces) {
  const NM = 90, NA = 60;
  const verts = [];
  const hw0 = s.halfWidth(face, 0);
  for (let i = 0; i <= NM; i++) {
    const m = face.profile.arcInv(face.arcMax * (i / NM));
    const hw = s.halfWidth(face, m);
    for (let j = 0; j <= NA; j++) verts.push(s.sample(face, m, -hw + (2 * hw) * (j / NA)));
  }
  const pos = [];
  const row = NA + 1;
  for (let i = 0; i < NM; i++) {
    for (let j = 0; j < NA; j++) {
      const a = verts[i * row + j], b = verts[i * row + j + 1], c = verts[(i + 1) * row + j + 1], d = verts[(i + 1) * row + j];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  parts.push({ id: face.id, positions: pos, color: COLORS[face.id] ?? [150, 150, 150] });
  console.log(face.id, 'mMax', face.mMax.toFixed(3), 'arcMax', face.arcMax.toFixed(3), 'hw0', hw0.toFixed(3), 'hw(mMax)', s.halfWidth(face, face.mMax).toFixed(3), 'gable', face.gable, 'hips', face.hips);
}

function shot(view, target, dist, el = 1.4) {
  const frame = makeFrame(520, 380);
  const cam = camera({ az: view === 'top' ? 0.0001 : 0.6, el, dist, target, fov: 30, aspect: 520 / 380 });
  drawGround(frame, cam, 30, 0);
  for (const p of parts) drawMesh(frame, cam, p.positions, p.color);
  return frame;
}
mkdirSync('out', { recursive: true });
const W = roof.spec.footprint.width / 2 + roof.spec.overhang.eave;
const D = roof.spec.footprint.depth / 2 + roof.spec.overhang.eave;
const sheet = contactSheet([
  shot('top', [0, 0, 0], Math.max(W, D) * 4.6),
  shot('top', [0, 0, 0], Math.max(W, D) * 4.6, 1.15),
  shot('top', [W * 0.62, 0, D * 0.62], Math.max(W, D) * 1.5, 1.35),
  shot('hero', [W * 0.62, roof.surface.hEave, D * 0.62], Math.max(W, D) * 1.2, 0.55),
]);
writeFileSync(`out/debug-surface-${name}.png`, frameToPNG(sheet));
console.log('out/debug-surface-' + name + '.png');
