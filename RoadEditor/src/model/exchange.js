// Exchange (grade-separated interchange) generator. A diamond: the mainline rises on a bridge over
// the cross road, the cross road stays at ground level, and four 45-degree ramps join the
// mainline and cross-road junctions. The output is ordinary junctions and roads, so every part can
// be edited afterwards. Local frame: u along the mainline, v along the cross road; the result is
// rotated by angle and translated to (x, z).

import { defaultJunction, defaultRoad } from './project.js';

export function diamondExchange(opts = {}) {
  const prefix = opts.prefix || 'X1';
  const x0 = opts.x ?? 0;
  const z0 = opts.z ?? 0;
  const ang = ((opts.angle ?? 0) * Math.PI) / 180;
  const H = opts.clearance ?? 5.5; // deck height above the cross road
  const grade = opts.grade ?? 0.05; // approach grade
  const dH = opts.deckHalf ?? 14; // half length of the bridged section
  const arm = opts.arm ?? 60; // length of the four far arms
  const A = dH + H / grade; // mainline and cross-road junction distance from the centre
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const W = (u, v) => ({ x: x0 + u * cos - v * sin, z: z0 + u * sin + v * cos });
  const jid = (n) => `${prefix}-${n}`;
  const rid = (n) => `${prefix}-${n}`;

  const junctions = [];
  const at = (name, u, v, extra = {}) => {
    const p = W(u, v);
    junctions.push(defaultJunction(jid(name), p.x, p.z, { radius: opts.radius ?? 8, y: 0, ...extra }));
  };
  at('MW', -A, 0);
  at('ME', A, 0);
  at('XS', 0, -A);
  at('XN', 0, A);
  at('MWF', -A - arm, 0, { radius: 6 });
  at('MEF', A + arm, 0, { radius: 6 });
  at('XSF', 0, -A - arm, { radius: 6 });
  at('XNF', 0, A + arm, { radius: 6 });

  const lanesL = opts.lanesL ?? 1;
  const lanesR = opts.lanesR ?? 1;
  const base = { lanesL, lanesR };
  const roads = [];
  const straight = (name, a, b, extra = {}) => roads.push(defaultRoad(rid(name), jid(a), jid(b), { ...base, ...extra }));
  const deckBridge = { on: true, from: 0, to: null, depth: 0.9, pierSpacing: 18, pierW: 1.2 };
  straight('M1', 'MWF', 'MW');
  // the bridged mainline: ground at the junctions, deck over the cross road
  const mp = (u, y) => ({ ...W(u, 0), y });
  const ctrl = [mp(-dH, H), mp(0, H), mp(dH, H)].map((c) => ({ x: c.x, z: c.z, y: c.y }));
  roads.push(defaultRoad(rid('M2'), jid('MW'), jid('ME'), { ...base, ctrl, bridge: deckBridge, guard: { on: true, side: 'both', offset: 0.3, postSpacing: 2.5 } }));
  straight('M3', 'ME', 'MEF');
  straight('X1', 'XSF', 'XS');
  straight('X2', 'XS', 'XN');
  straight('X3', 'XN', 'XNF');
  straight('RSW', 'MW', 'XS');
  straight('RNW', 'MW', 'XN');
  straight('RSE', 'ME', 'XS');
  straight('RNE', 'ME', 'XN');
  return { junctions, roads, centre: { x: x0, z: z0 }, extent: A + arm };
}
