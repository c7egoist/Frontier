// Freehand road sketches: turn a drawn path into a road between junctions. Pure and testable.

import { pathLength, simplifyPath } from '../geo/sketch.js';

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Returns {newJunctions: [{id, x, z}], road: {a, b, ctrl}} or {error}. Ends snap to a junction
 * within `snap` metres; otherwise a junction is created there. Interior points become control points.
 */
export function planSketch(project, pts, opts = {}) {
  if (!Array.isArray(pts) || pts.length < 2) return { error: 'Drag across the plan to sketch a road' };
  if (pathLength(pts) < 6) return { error: 'That sketch is under 6 m long' };
  const snap = opts.snap ?? 4;
  const simple = simplifyPath(pts, opts.eps ?? 0.5);
  const used = new Set(project.junctions.map((j) => j.id));
  const newJunctions = [];
  let n = 1;
  const freshId = () => {
    let id;
    do {
      id = `J${n++}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
  const near = (x, z) => {
    let best = null;
    let bd = snap;
    for (const j of project.junctions) {
      const d = Math.hypot(j.x - x, j.z - z);
      if (d <= bd) {
        best = j;
        bd = d;
      }
    }
    return best;
  };
  const endAt = (x, z) => {
    const hit = near(x, z);
    if (hit) return hit.id;
    const id = freshId();
    newJunctions.push({ id, x: r2(x), z: r2(z) });
    return id;
  };
  const [x0, z0] = simple[0];
  const [x1, z1] = simple[simple.length - 1];
  const hitA = near(x0, z0);
  const hitB = near(x1, z1);
  if (hitA && hitB && hitA.id === hitB.id) {
    return { error: 'Both ends of the sketch land on the same junction; draw it between two different places' };
  }
  const a = endAt(x0, z0);
  const b = endAt(x1, z1);
  const ctrl = simple
    .slice(1, -1)
    .slice(0, opts.maxCtrl ?? 40)
    .map(([x, z]) => ({ x: r2(x), z: r2(z), y: null }));
  return { newJunctions, road: { a, b, ctrl } };
}
