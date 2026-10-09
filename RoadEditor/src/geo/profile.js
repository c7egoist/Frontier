// Cross-section model. A road section is a list of "strips": lateral polylines [l, h] (l = offset
// left of travel, h = absolute height). The same strip list is built at every station, so spans
// become quads between consecutive stations and junction hubs can reuse the exact same numbers at
// the mouth. Near a junction the road blends into the junction plateau: flat at the junction
// height, no camber, junction band widths. Roads without junctions never occur (every end is a node).

import { clamp, smooth01 } from '../core/vec.js';
import { stationAt } from './curve.js';

export const TAPER = 10; // m over which a road leaves the junction plateau
export const GUTTER_DROP = 0.02; // m, gutter fall toward the kerb
export const EMBANK_SLOPE = 1.5; // horizontal run per metre of fill height
export const DECK_TRANSITION = 1.0; // m, bridge deck ramp at a partial bridge end
export const DITCH_WIDTH = 0.6; // m, verge ditch bottom width
export const DITCH_SETBACK = 0.3; // m, verge flat before the ditch

export function camOffset(mode, cam, l) {
  if (mode === 'left') return -cam * l;
  if (mode === 'right') return cam * l;
  return -cam * Math.abs(l); // crown
}

/** bridge weight 0..1 at arc length s (1 inside the deck range, ramped over 1 m at partial ends) */
export function bridgeWeight(road, s, L) {
  const br = road.bridge;
  if (!br || !br.on) return 0;
  const from = Math.max(0, br.from ?? 0);
  const to = br.to == null ? L : Math.min(br.to, L);
  if (to <= from) return 0;
  const left = from <= 0 ? 1 : smooth01((s - from) / DECK_TRANSITION);
  const right = to >= L ? 1 : smooth01((to - s) / DECK_TRANSITION);
  return clamp(Math.min(left, right), 0, 1);
}

/**
 * Blend state at arc length s. ctx = {L, Da, Db, jA, jB, yA, yB, taper} where jA/jB are the
 * junction band tables {g, k, f, v, kh} of the two end junctions and yA/yB their heights.
 */
export function stationState(curve, ctx, road, s, station) {
  const st = station || stationAt(curve, s);
  const L = ctx.L;
  const T = Math.max(ctx.taper, 1e-6);
  const wa = 1 - smooth01((s - ctx.Da) / T);
  const wb = 1 - smooth01((L - s - ctx.Db) / T);
  const wR = Math.max(0, 1 - wa - wb);
  const tot = wa + wb + wR;
  const mix = (ja, jb, own) => (wa * ja + wb * jb + wR * own) / tot;
  return {
    s,
    st,
    y: mix(ctx.yA, ctx.yB, st.y),
    camW: wR / tot,
    g: mix(ctx.jA.g, ctx.jB.g, road.gutter),
    k: mix(ctx.jA.k, ctx.jB.k, road.kerbW),
    f: mix(ctx.jA.f, ctx.jB.f, road.footway),
    v: mix(ctx.jA.v, ctx.jB.v, road.verge),
    kh: mix(ctx.jA.kh, ctx.jB.kh, road.kerbH),
    ditchW: road.ditch ? wR / tot : 0,
    bridgeW: bridgeWeight(road, s, L),
    W: { L: road.lanesL * road.laneW, R: road.lanesR * road.laneW },
  };
}

/** strip list for one station state. Structure (count, order, point counts) is constant. */
export function sectionStrips(road, S) {
  const y = S.y;
  const cam = road.camber * S.camW;
  const mode = road.camberMode;
  const hAt = (l) => y + camOffset(mode, cam, l);
  const bw = S.bridgeW;
  const dep = (road.bridge.depth || 0) * bw;
  const gd = S.g > 0 ? GUTTER_DROP : 0;
  const strips = [];
  const outer = {};
  for (const sg of [1, -1]) {
    const e = (l) => sg * l;
    const Wd = sg > 0 ? S.W.L : S.W.R;
    const L1 = Wd + S.g;
    const L2 = L1 + S.k;
    const L3 = L2 + S.f;
    const L4 = L3 + S.v;
    const yk = y + S.kh;
    const hE = hAt(Wd);
    outer[sg > 0 ? 'L' : 'R'] = L4;
    strips.push({ mat: 'asphalt', pts: [[0, hAt(0)], [e(Wd), hE]] });
    strips.push({ mat: 'gutter', pts: [[e(Wd), hE], [e(L1), hE - gd]] });
    strips.push({ mat: 'kerb', pts: [[e(L1), hE - gd], [e(L1), yk]] });
    strips.push({ mat: 'kerb', pts: [[e(L1), yk], [e(L2), yk]] });
    strips.push({ mat: 'footway', pts: [[e(L2), yk], [e(L3), yk]] });
    strips.push({ mat: 'kerb', pts: [[e(L3), yk], [e(L3), y]] });
    // verge, optionally with a V ditch that fades out at the junction plateau
    const dd = road.ditch ? (road.ditchDepth || 0) * S.ditchW : 0;
    const a = Math.min(DITCH_SETBACK, Math.max(0, L4 - L3));
    const b = Math.min(L3 + a + DITCH_WIDTH, L4);
    const c = Math.min(L3 + a + DITCH_WIDTH / 2, L4);
    const d = Math.min(L3 + a, L4);
    strips.push({
      mat: 'verge',
      pts: [[e(L3), y], [e(d), y], [e(c), y - dd], [e(b), y], [e(L4), y]],
    });
    const far = L4 + EMBANK_SLOPE * Math.abs(y) * (1 - bw);
    strips.push({ mat: 'embank', pts: [[e(L4), y], [e(far), y * bw]] });
    strips.push({ mat: 'deck', pts: [[e(L4), y], [e(L4), y - dep]] });
  }
  // underside of the deck, spanning both outer edges
  const R4 = outer.R ?? S.W.R;
  const L4o = outer.L ?? S.W.L;
  strips.push({ mat: 'deck', pts: [[-R4, y - dep], [L4o, y - dep]] });
  return strips;
}

/** outer lateral extents (left, right) of the section at this state */
export function outerExtents(S) {
  const L4 = (W, g, k, f, v) => W + g + k + f + v;
  return {
    L: L4(S.W.L, S.g, S.k, S.f, S.v),
    R: L4(S.W.R, S.g, S.k, S.f, S.v),
  };
}

/** band table of a road (no blend) */
export function roadBands(road) {
  return { g: road.gutter, k: road.kerbW, f: road.footway, v: road.verge, kh: road.kerbH };
}

export function bandTableMax(list) {
  const out = { g: 0, k: 0, f: 0, v: 0, kh: 0 };
  for (const b of list) {
    out.g = Math.max(out.g, b.g);
    out.k = Math.max(out.k, b.k);
    out.f = Math.max(out.f, b.f);
    out.v = Math.max(out.v, b.v);
    out.kh = Math.max(out.kh, b.kh);
  }
  return out;
}
