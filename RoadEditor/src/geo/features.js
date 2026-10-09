// Road features swept along the same stations as the section: centre / edge / lane markings,
// guardrails with posts, gullies and drainage pipes, and bridge piers. Every feature takes its
// height from the same station state, so it follows camber, grade and junction blends.

import { curveSlice, stationAt } from './curve.js';
import { camOffset, stationState } from './profile.js';

export const MARK_LIFT = 0.006;
export const MARK_WIDTH = 0.12;
export const DASH = { on: 3, off: 9 };

export function heightAt(road, S, l) {
  return S.y + camOffset(road.camberMode, road.camber * S.camW, l);
}

/**
 * Sweep a lateral profile [[l, dh], ...] along the stations. baseL(S) adds a state-dependent
 * lateral base; heights are surface height at the lateral plus dh.
 */
export function sweep(mb, mat, owner, road, sts, states, profile, baseL = () => 0) {
  for (let k = 0; k < sts.length - 1; k++) {
    const A = sts[k];
    const B = sts[k + 1];
    const SA = states[k];
    const SB = states[k + 1];
    const bA = baseL(SA);
    const bB = baseL(SB);
    for (let i = 0; i < profile.length - 1; i++) {
      const [la0, da0] = profile[i];
      const [la1, da1] = profile[i + 1];
      const l0A = bA + la0;
      const l1A = bA + la1;
      const l0B = bB + la0;
      const l1B = bB + la1;
      const pA0 = [A.x + A.nx * l0A, heightAt(road, SA, l0A) + da0, A.z + A.nz * l0A];
      const pA1 = [A.x + A.nx * l1A, heightAt(road, SA, l1A) + da1, A.z + A.nz * l1A];
      const pB0 = [B.x + B.nx * l0B, heightAt(road, SB, l0B) + da0, B.z + B.nz * l0B];
      const pB1 = [B.x + B.nx * l1B, heightAt(road, SB, l1B) + da1, B.z + B.nz * l1B];
      mb.quad(mat, owner, pA0, pA1, pB1, pB0);
    }
  }
}

/** plan polyline for a lateral offset along stations */
export function planLine(sts, states, baseL, l) {
  return sts.map((st, k) => {
    const lat = baseL(states[k]) + l;
    return [st.x + st.nx * lat, st.z + st.nz * lat];
  });
}

function statesFor(curve, ctx, road, sts) {
  return sts.map((st) => stationState(curve, ctx, road, st.s, st));
}

/** box (pier, post) aligned to the local tangent / normal */
export function boxAt(mb, mat, owner, cx, cz, tx, tz, hu, hv, y0, y1, cy = 0) {
  const nx = tz;
  const nz = -tx;
  const corner = (u, v) => [cx + tx * u + nx * v, 0, cz + tz * u + nz * v];
  const bl = corner(-hu, -hv);
  const br = corner(hu, -hv);
  const tr = corner(hu, hv);
  const tl = corner(-hu, hv);
  const P = (p, y) => [p[0], y, p[2]];
  const bot = y0 + cy;
  const top = y1 + cy;
  mb.quad(mat, owner, P(bl, bot), P(br, bot), P(br, top), P(bl, top));
  mb.quad(mat, owner, P(br, bot), P(tr, bot), P(tr, top), P(br, top));
  mb.quad(mat, owner, P(tr, bot), P(tl, bot), P(tl, top), P(tr, top));
  mb.quad(mat, owner, P(tl, bot), P(bl, bot), P(bl, top), P(tl, top));
  mb.quad(mat, owner, P(bl, top), P(br, top), P(tr, top), P(tl, top));
}

/** centre, edge and lane markings between the given stations (spans only) */
export function markingsFor(road, curve, ctx, mb, owner, plan) {
  const a = ctx.Da;
  const b = ctx.L - ctx.Db;
  if (b - a < 0.5) return;
  const mk = road.marks || {};
  const zero = () => 0;
  const pushPlan = (color, sts, states, base, l) => {
    plan.marks.push({ color, width: MARK_WIDTH, pts: planLine(sts, states, base, l) });
  };
  const alongDashes = (fn) => {
    if (mk.centre === 'dashed' || (mk.centre !== 'solid' && mk.centre !== 'none')) {
      for (let s = a; s < b - 0.2; s += DASH.on + DASH.off) fn(s, Math.min(s + DASH.on, b));
    } else if (mk.centre === 'solid') fn(a, b);
  };
  if (mk.centre && mk.centre !== 'none') {
    alongDashes((s0, s1) => {
      const sts = curveSlice(curve, s0, s1);
      if (sts.length < 2) return;
      const states = statesFor(curve, ctx, road, sts);
      sweep(mb, 'white', owner, road, sts, states, [[-MARK_WIDTH / 2, MARK_LIFT], [MARK_WIDTH / 2, MARK_LIFT]]);
      pushPlan('#f2f2ee', sts, states, zero, 0);
    });
  }
  if (mk.edges) {
    for (const sg of [1, -1]) {
      const base = (S) => sg * ((sg > 0 ? S.W.L : S.W.R) - 0.25);
      const sts = curveSlice(curve, a, b);
      const states = statesFor(curve, ctx, road, sts);
      sweep(mb, 'white', owner, road, sts, states, [[-MARK_WIDTH / 2, MARK_LIFT], [MARK_WIDTH / 2, MARK_LIFT]], base);
      pushPlan('#f2f2ee', sts, states, base, 0);
    }
  }
  if (mk.lanes) {
    const lanesL = road.lanesL;
    const lanesR = road.lanesR;
    for (const [sg, n] of [
      [1, lanesL],
      [-1, lanesR],
    ]) {
      for (let k = 1; k < n; k++) {
        const base = () => sg * k * road.laneW;
        for (let s = a; s < b - 0.2; s += DASH.on + DASH.off) {
          const seg = curveSlice(curve, s, Math.min(s + DASH.on, b));
          if (seg.length < 2) continue;
          const sStates = statesFor(curve, ctx, road, seg);
          sweep(mb, 'white', owner, road, seg, sStates, [[-MARK_WIDTH / 2, MARK_LIFT], [MARK_WIDTH / 2, MARK_LIFT]], base);
          pushPlan('#f2f2ee', seg, sStates, base, 0);
        }
      }
    }
  }
}

/** guardrail (W-beam approximated as a box rail) with posts on each selected side */
export function guardrailFor(road, curve, ctx, mb, owner, plan) {
  const gr = road.guard;
  if (!gr || !gr.on) return;
  const a = ctx.Da + 1.5;
  const b = ctx.L - ctx.Db - 1.5;
  if (b - a < 2) return;
  const sides = gr.side === 'left' ? [1] : gr.side === 'right' ? [-1] : [1, -1];
  const spacing = Math.max(1, gr.postSpacing || 2.5);
  const rail = [
    [-0.05, 0.35],
    [0.05, 0.35],
    [0.05, 0.75],
    [-0.05, 0.75],
    [-0.05, 0.35],
  ];
  for (const sg of sides) {
    const base = (S) => sg * ((sg > 0 ? S.W.L : S.W.R) + S.g + S.k + S.f + (gr.offset ?? 0.3));
    const sts = curveSlice(curve, a, b);
    const states = statesFor(curve, ctx, road, sts);
    sweep(mb, 'guard', owner, road, sts, states, rail, base);
    plan.guards.push({ pts: planLine(sts, states, base, 0) });
    for (let s = a; s <= b + 1e-6; s += spacing) {
      const st = stationAt(curve, s);
      const S = stationState(curve, ctx, road, s, st);
      const l = base(S);
      const cx = st.x + st.nx * l;
      const cz = st.z + st.nz * l;
      const y = heightAt(road, S, l);
      boxAt(mb, 'post', owner, cx, cz, st.tx, st.tz, 0.07, 0.07, y, y + 0.8);
    }
  }
}

/** gullies on the gutter and optional drainage pipes below the verge/gutter */
export function drainageFor(road, curve, ctx, mb, owner, plan) {
  const dr = road.drain || {};
  const a = ctx.Da;
  const b = ctx.L - ctx.Db;
  if (b - a < 1) return;
  if (dr.gullies && road.gutter > 0.05) {
    const spacing = Math.max(4, dr.gullySpacing || 24);
    for (const sg of [1, -1]) {
      const base = (S) => sg * ((sg > 0 ? S.W.L : S.W.R) + S.g / 2);
      for (let s = a + 3; s <= b - 3; s += spacing) {
        const sts = curveSlice(curve, s - 0.25, s + 0.25);
        if (sts.length < 2) continue;
        const states = statesFor(curve, ctx, road, sts);
        const dh = -0.012;
        sweep(mb, 'grate', owner, road, sts, states, [[-0.2, dh], [0.2, dh]], base);
        plan.drains.push({ kind: 'gully', pts: planLine(sts, states, base, 0) });
      }
    }
  }
  if (dr.pipes) {
    const depth = dr.pipeDepth || 0.9;
    const size = dr.pipeSize || 0.3;
    for (const sg of [1, -1]) {
      const base = (S) => sg * ((sg > 0 ? S.W.L : S.W.R) + S.g / 2);
      const sts = curveSlice(curve, a, b);
      const states = statesFor(curve, ctx, road, sts);
      const h = size / 2;
      const prof = [
        [-h, -depth - h],
        [h, -depth - h],
        [h, -depth + h],
        [-h, -depth + h],
        [-h, -depth - h],
      ];
      sweep(mb, 'pipe', owner, road, sts, states, prof, base);
      plan.drains.push({ kind: 'pipe', pts: planLine(sts, states, base, 0) });
    }
  }
}

/** piers under a bridged stretch where the underside is clear of the ground */
export function bridgePiers(road, curve, ctx, mb, owner, plan) {
  const br = road.bridge;
  if (!br || !br.on) return;
  const from = Math.max(ctx.Da + 2, br.from ?? 0);
  const to = Math.min(ctx.L - ctx.Db - 2, br.to == null ? ctx.L : br.to);
  if (to - from < 2) return;
  const spacing = Math.max(4, br.pierSpacing || 18);
  const hw = (br.pierW || 1.2) / 2;
  const depth = br.depth || 0.9;
  for (let s = from; s <= to + 1e-6; s += spacing) {
    const st = stationAt(curve, s);
    const S = stationState(curve, ctx, road, s, st);
    const under = S.y - depth * (S.bridgeW || 1);
    if (under < 0.3) continue;
    boxAt(mb, 'pier', owner, st.x, st.z, st.tx, st.tz, hw, hw, 0, under);
    plan.piers.push({ x: st.x, z: st.z, w: hw * 2 });
  }
}

/** lane / centre marking helper exported for tests */
export function __dashCount(length) {
  return Math.floor(length / (DASH.on + DASH.off)) + 1;
}
