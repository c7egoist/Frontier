/**
 * Frontier — roof structure
 * -------------------------
 * The real stack, bottom → top (docs/ROOF_RESEARCH.md §4.1):
 *
 *   真束 → 棟木 (ridge beam) ─ 母屋 (purlins) ─ 軒桁 (eave beams) ─ 小屋梁 (ties)
 *     └ 垂木 taruki   common rafters, 45×60 @ 455 mm, cantilevered past the wall
 *        └ 野地板 nojita      roof sheathing
 *           └ ルーフィング    underlayment
 *              └ 瓦桟 gasan   tile battens, one per course
 *                 └ 瓦 kawara  tiles
 *
 * Every layer is an offset of the SAME surface S, so contact between layers is not
 * approximate — it is the definition. Rafters are parallel to each other and cut
 * against the 隅木 hip rafters (Japanese/Korean practice), not fanned.
 */

import { Part, lerp, clamp, vadd, vsub, vmul, vnorm, vcross, vlen } from './geom.js';

export const LAYER_ORDER = [
  'roof.tiles', 'roof.tiles.eave', 'roof.ridge', 'roof.hipridge', 'roof.verge',
  'roof.battens', 'roof.underlay', 'roof.deck', 'roof.rafters', 'roof.hiprafters',
  'roof.purlins', 'roof.ridgebeam', 'roof.beams', 'roof.posts', 'roof.eaveboard',
  'roof.bargeboard', 'roof.lanterns', 'building.volume',
];

/**
 * Offsets of the construction layers below the tile bed surface, in metres.
 * Contact between consecutive layers is exact: layer[k].top === layer[k-1].bottom.
 */
export function layerOffsets(spec, tile) {
  const battenH = spec.frame.battens.enabled ? (spec.frame.battens.height ?? 0.03) : 0;
  const underlayT = spec.frame.underlayment?.thickness ?? 0.002;
  const deckT = spec.frame.deck?.thickness ?? 0.015;
  const rafterDepth = spec.frame.rafter.depth ?? 0.06;
  const tileT = tile.thickness;
  // deepest of the batten grid and the tile material itself (茅葺/柿葺 hang deep)
  const deckTop = Math.max(battenH, tile.bedDepth ?? 0) + underlayT;
  const o = {
    battenH, underlayT, deckT, rafterDepth, tileT,
    deckTop,
    deckBottom: deckTop + deckT,
  };
  o.rafterTop = o.deckBottom;                       // rafters carry the sheathing
  o.rafterBottom = o.rafterTop + rafterDepth;
  return o;
}

/** Offset a surface point down along its normal. */
function off(surface, face, m, a, depth) {
  const f = surface.frameAt(face, m, a);
  return { origin: vadd(f.origin, vmul(f.normal, -depth)), frame: f, normal: f.normal };
}

/** Max metric a rafter at across-position a may reach (cut against the hip). */
export function rafterMaxM(surface, face, a) {
  const absA = Math.abs(a);
  // Every rafter is cut where the surface ends: the ridge/break line above, and the
  // 隅棟 (hip) diagonal to the side. `halfWidth(face, m) = 0` gives that diagonal.
  let mTop = face.mMax;
  if (face.kind === 'main') {
    if (face.hips) {
      // The 妻 (gable) section between the hips runs the full slope; the hip sections
      // beside it are cut on the diagonal: halfWidth(m) = half − m down to `gable`.
      const gable = face.gable ?? face.half;
      if (absA > gable - 1e-6) mTop = Math.min(mTop, face.half - absA);
    }
  } else {
    // end (hip) face: the surface is the triangle 0 ≤ |a| ≤ half − m
    mTop = Math.min(mTop, face.half - absA);
  }
  return Math.max(0, mTop);
}

// ── tiles battens 瓦桟 ────────────────────────────────────────────────────────
export function buildBattens(part, surface, tile, spec, courses) {
  const h = spec.frame.battens.height ?? 0.03;
  const t = spec.frame.battens.thickness ?? 0.015;
  const records = [];
  let n = 0;
  for (const face of surface.faces) {
    const prof = face.profile;
    const steps = Math.max(8, Math.round(surface.halfWidth(face, 0) / 0.18));
    const gate = courses?.[face.id];
    for (const course of (face.courses || [])) {
      const m = course.m;
      const hw = surface.halfWidth(face, m);
      if (hw < 0.05) continue;
      if (gate && gate.maxArc != null && course.arc > gate.maxArc) continue;
      const path = [];
      for (let i = 0; i <= steps * 2; i++) {
        const a = lerp(-hw, hw, i / (steps * 2));
        path.push(off(surface, face, m, a, 0));
      }
      const sec = [[-t / 2, -h], [t / 2, -h], [t / 2, 0], [-t / 2, 0]];
      const vStart = part.positions.length / 3;
      part.extrudePolygon(sec, path);
      const vEnd = part.positions.length / 3;
      records.push({ face: face.id, m, arc: course.arc, hw, h, vStart, vEnd });
      n++;
    }
  }
  return { count: n, records };
}

// ── sheathing 野地板 + underlayment ───────────────────────────────────────────
export function buildDeck(part, surface, spec, offs) {
  let quads = 0;
  for (const face of surface.faces) {
    const prof = face.profile;
    // fine enough that the sheathing's own chord sag stays ~2 mm under the tile bed,
    // and always sampling the face's feature metrics so neighbouring faces share rows.
    const mSteps = Math.max(12, Math.round(prof.arc(face.mMax) / 0.08));
    const ms = new Set();
    for (let i = 0; i <= mSteps; i++) ms.add(prof.arcInv(lerp(0, prof.arc(face.mMax), i / mSteps)));
    for (const fm of face.featureMs ?? []) ms.add(fm);
    const mList = [...ms].sort((a, b) => a - b);
    const aSteps = Math.max(12, Math.round(surface.halfWidth(face, 0) / 0.10));
    // one vertex grid, then the slab's top sheet, bottom sheet and its rim
    const top = [], bot = [];
    for (const m of mList) {
      const hw = surface.halfWidth(face, m);
      const rowT = [], rowB = [];
      for (let j = 0; j <= aSteps * 2; j++) {
        const a = lerp(-hw, hw, j / (aSteps * 2));
        const f = surface.frameAt(face, m, a);
        const up = [-f.normal[0], -f.normal[1], -f.normal[2]];
        rowT.push(vadd(f.origin, vmul(up, offs.deckTop)));
        rowB.push(vadd(f.origin, vmul(up, offs.deckBottom)));
      }
      top.push(rowT); bot.push(rowB);
    }
    const rows = mList.length, cols = aSteps * 2 + 1;
    for (let i = 0; i + 1 < rows; i++) {
      for (let j = 0; j + 1 < cols; j++) {
        part.quad2(top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);        // 野地板 top
        part.quad2(bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1], bot[i][j]);        // underside
        quads += 2;
      }
    }
    // rim: closes the slab along the eave, the ridge/break line and both 破風/hip edges
    for (let i = 0; i + 1 < rows; i++) {
      part.quad2(top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0]);
      part.quad2(top[i + 1][cols - 1], top[i][cols - 1], bot[i][cols - 1], bot[i + 1][cols - 1]);
      quads += 2;
    }
    for (let j = 0; j + 1 < cols; j++) {
      part.quad2(top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j]);
      part.quad2(top[rows - 1][j + 1], top[rows - 1][j], bot[rows - 1][j], bot[rows - 1][j + 1]);
      quads += 2;
    }
  }
  return quads;
}

export function buildUnderlayment(part, surface, spec, offs) {
  let quads = 0;
  for (const face of surface.faces) {
    const prof = face.profile;
    const mSteps = Math.max(4, Math.round(prof.arc(face.mMax) / 0.5));
    const aSteps = Math.max(4, Math.round(surface.halfWidth(face, 0) / 0.6));
    const grid = [];
    for (let i = 0; i <= mSteps; i++) {
      const m = prof.arcInv(lerp(0, prof.arc(face.mMax), i / mSteps));
      const hw = surface.halfWidth(face, m);
      const row = [];
      for (let j = 0; j <= aSteps * 2; j++) {
        const a = lerp(-hw, hw, j / (aSteps * 2));
        row.push(off(surface, face, m, a, (offs.deckTop + offs.battenH) / 2).origin);
      }
      grid.push(row);
    }
    for (let i = 0; i + 1 < grid.length; i++) {
      for (let j = 0; j + 1 < grid[i].length; j++) {
        part.quad2(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
        quads++;
      }
    }
  }
  return quads;
}

// ── common rafters 垂木 ───────────────────────────────────────────────────────
export function buildRafters(part, surface, spec, offs) {
  const spacing = spec.frame.rafter.spacing ?? 0.455;
  const w = spec.frame.rafter.width ?? 0.045;
  const d = spec.frame.rafter.depth ?? 0.06;
  const made = [];
  for (const face of surface.faces) {
    const prof = face.profile;
    const hw0 = surface.halfWidth(face, 0);
    // rafters are set out from the ridge centre line (芯垂木), so the count is even
    let count = Math.max(2, Math.round((hw0 * 2) / spacing));
    if (count % 2 === 1) count += 1;
    const realSpacing = (hw0 * 2) / count;
    for (let i = 0; i <= count; i++) {
      let a = -hw0 + i * realSpacing;
      a = Math.abs(a) < 1e-6 ? 0 : a;
      const mTop = rafterMaxM(surface, face, a);
      if (mTop < 0.12) continue;                       // nothing left after the hip trim
      // 垂木 are shaped/cut to the curve; keep the chord sag well under 5 mm
      const steps = Math.max(4, Math.ceil(prof.arc(mTop) / 0.28));
      const path = [];
      const normalOf = (p, idx) => {
        const f = surface.frameAt(face, prof.arcInv(lerp(0, prof.arc(mTop), idx / steps)), a);
        return f.normal;
      };
      for (let s = 0; s <= steps; s++) {
        const m = prof.arcInv(lerp(0, prof.arc(mTop), s / steps));
        const f = off(surface, face, m, a, offs.rafterTop);
        path.push(f.origin);
      }
      // rafter = a curved beam: top face on the sheathing underside
      part.curvedBeam(path, w, d, (p, idx) => {
        const m = prof.arcInv(lerp(0, prof.arc(mTop), idx / steps));
        return surface.normalAt(face, m, a);
      }, [0, -d]);
      made.push({ face: face.id, a, mTop, top: offs.rafterTop });
    }
  }
  return made;
}

// ── purlins 母屋 + ridge beam 棟木 ────────────────────────────────────────────
export function buildPurlins(part, surface, spec, offs) {
  const size = spec.frame.purlin?.size ?? [0.105, 0.105];
  const made = [];
  for (const face of surface.faces) {
    const prof = face.profile;
    const stations = prof.stations.slice(1, -1);        // intermediate purlins only
    for (const m of stations) {
      // a 母屋 only exists where its face does: past the break line of a truncated end
      // face the member belongs to the main faces only
      if (m > face.mMax - 1e-6) continue;
      const hw = surface.halfWidth(face, m);
      if (hw < 0.15) continue;
      const y = prof.h(m) + surface.hEave;
      const depth = offs.rafterBottom;
      const path = [];
      const n = Math.max(4, Math.round(hw / 0.22));
      for (let i = 0; i <= n * 2; i++) {
        const a = lerp(-hw, hw, i / (n * 2));
        const f = surface.frameAt(face, m, a);
        path.push({ origin: vadd(f.origin, vmul(f.normal, -depth)), frame: f });
      }
      const sec = [[-size[1] / 2, -size[0]], [size[1] / 2, -size[0]], [size[1] / 2, 0], [-size[1] / 2, 0]];
      part.extrudePolygon(sec, path);
      made.push({ face: face.id, m, hw });
    }
  }
  return made;
}

export function buildRidgeBeam(part, surface, spec, offs) {
  const size = spec.frame.ridgeBeam?.size ?? [0.15, 0.18];
  const [p0, p1] = surface.ridgeLine();
  const y = surface.hRidge - offs.rafterBottom;
  const a = [p0[0], y, p0[2]], b = [p1[0], y, p1[2]];
  part.boxBetween(a, b, [size[1], size[0]], [0, 1, 0]);
  return { length: vlen(vsub(b, a)), size };
}

// ── eave beams 軒桁, tie beams 小屋梁, posts 束 / 真束, wall posts ────────────
export function buildPrimaryFrame(part, surface, spec, offs, opts = {}) {
  const out = { eaveBeams: [], ties: [], posts: [], crownPosts: [] };
  const eaveBeamSize = spec.frame.eaveBeam?.size ?? [0.12, 0.12];
  const tieSize = spec.frame.tieBeam?.size ?? [0.15, 0.18];
  const postSize = spec.frame.post?.size ?? [0.12, 0.12];

  for (const face of surface.faces) {
    const mWall = face.mWall;
    const hw = surface.halfWidth(face, mWall);
    const path = [];
    const n = Math.max(4, Math.round(hw / 0.22));
    for (let i = 0; i <= n * 2; i++) {
      const a = lerp(-hw, hw, i / (n * 2));
      const f = surface.frameAt(face, mWall, a);
      path.push({ origin: vadd(f.origin, vmul(f.normal, -offs.rafterBottom)), frame: f });
    }
    const sec = [[-eaveBeamSize[1] / 2, -eaveBeamSize[0]], [eaveBeamSize[1] / 2, -eaveBeamSize[0]],
      [eaveBeamSize[1] / 2, 0], [-eaveBeamSize[1] / 2, 0]];
    part.extrudePolygon(sec, path);
    const mid = surface.frameAt(face, mWall, 0);
    const top = vadd(mid.origin, vmul(mid.normal, -offs.rafterBottom));
    out.eaveBeams.push({
      face: face.id, sign: face.sign, size: eaveBeamSize,
      top, topY: top[1], z: top[2], aRange: [-hw, hw],
    });
  }

  // tie beams 小屋梁 spanning front ↔ back eave beams, on the crown-post grid
  const pitch = spec.frame.tieBeam?.spacing ?? 1.82;                 // 1 ken
  const halfSpan = (surface.ridgeHalf || 1);
  const nTies = Math.max(2, Math.round((halfSpan * 2) / pitch));
  const eb = out.eaveBeams;
  if (eb.length >= 2 && eb[0].sign > 0 && eb[1].sign < 0) {
    const front = eb.find((e) => e.sign > 0), back = eb.find((e) => e.sign < 0);
    for (let i = 0; i <= nTies; i++) {
      const t = i / nTies;
      const x = lerp(-halfSpan, halfSpan, t);
      // the eave beams run along X at constant z, so the tie spans between them
      const a1 = [x, front.topY - eaveBeamSize[0], front.z];
      const a2 = [x, back.topY - eaveBeamSize[0], back.z];
      part.boxBetween(a1, a2, [tieSize[1], tieSize[0]], [0, 1, 0]);
      out.ties.push({ x, a1, a2 });

      // 真束 crown post: tie beam top → ridge beam underside
      const yTie = (a1[1] + a2[1]) / 2;
      const yRidge = surface.hRidge - offs.rafterBottom - (spec.frame.ridgeBeam?.size?.[0] ?? 0.15);
      if (yRidge - yTie > 0.15) {
        const p = [x, yTie, surface.ridgeZ];
        const q = [x, yRidge, surface.ridgeZ];
        part.boxBetween(p, q, [postSize[0], postSize[1]], [0, 1, 0]);
        out.crownPosts.push({ x, yTie, yRidge });
      }
      // 束 struts under each purlin station (wagoya-gumi)
      const mainFace = surface.mainFaces[0];
      for (const m of mainFace.profile.stations.slice(1, -1)) {
        const f = surface.frameAt(mainFace, m, clamp(x, -surface.halfWidth(mainFace, m), surface.halfWidth(mainFace, m)));
        const purlinBottomY = f.origin[1] - offs.rafterBottom - (spec.frame.purlin?.size?.[0] ?? 0.105);
        const a1y = yTie;
        if (purlinBottomY - a1y > 0.2) {
          part.boxBetween([x, a1y + tieSize[0] * 0.5, f.origin[2]], [x, purlinBottomY, f.origin[2]],
            [postSize[0] * 0.7, postSize[0] * 0.7], [0, 1, 0]);
          out.posts.push({ x, m });
        }
      }
    }
  }

  // wall posts down to the plinth (the building itself comes in phase 2)
  if (opts.postsToGround !== false) {
    for (const e of out.eaveBeams) {
      const n = Math.max(2, Math.round((e.aRange[1] - e.aRange[0]) / 1.82));
      for (let i = 0; i <= n; i++) {
        const a = lerp(e.aRange[0], e.aRange[1], i / n);
        const face = surface.faceById(e.face);
        const f = surface.frameAt(face, face.mWall, a);
        const top = vadd(f.origin, vmul(f.normal, -offs.rafterBottom - (e.size?.[0] ?? 0.12)));
        const bottom = [top[0], 0, top[2]];
        if (top[1] > 0.3) part.boxBetween(bottom, top, [postSize[0], postSize[1]], [0, 1, 0]);
      }
    }
  }
  return out;
}

// ── hip rafters 隅木 ──────────────────────────────────────────────────────────
export function buildHipRafters(part, surface, spec, offs) {
  const hips = surface.hipLines();
  const size = spec.frame.hipRafter?.size ?? [0.13, 0.15];
  let n = 0;
  for (const hip of hips) {
    const pts = hip.points;
    const path = pts.map((p) => p);
    // sit the hip rafter so its top face touches the sheathing underside
    const mainF = surface.faces.find((f) => f.kind === 'main' && f.sign === hip.sz);
    const endF = surface.faces.find((f) => f.kind === 'end' && f.sign === hip.sx);
    part.curvedBeam(path, size[0], size[1], (p, idx) => {
      const m = (idx / (path.length - 1)) * surface.hipRun;
      const nA = surface.normalAt(mainF, Math.min(m, mainF.mMax), hip.sx * (mainF.half - m));
      const nB = surface.normalAt(endF, Math.min(m, endF.mMax), hip.sz * (endF.half - m));
      return vnorm(vadd(nA, nB));
    }, [-size[1], 0]);
    n++;
  }
  return n;
}

// ── 提灯 eave lanterns (the "add lights" hook on the roof) ────────────────────
export function buildEaveLanterns(part, surface, spec) {
  const cfg = spec.lights?.eaveLanterns;
  if (!cfg || cfg.enabled === false) return 0;
  const spacing = cfg.spacing ?? 2.4;
  const r = cfg.radius ?? 0.11;
  const h = cfg.height ?? 0.28;
  let n = 0;
  for (const face of surface.faces) {
    if (face.kind !== 'main') continue;
    const hw = surface.halfWidth(face, 0);
    const count = Math.max(1, Math.round((hw * 2) / spacing));
    for (let i = 0; i <= count; i++) {
      if (cfg.cornersOnly && i !== 0 && i !== count) continue;
      const a = lerp(-hw * 0.94, hw * 0.94, i / count);
      const m = Math.max(0.05, face.mWall - 0.12);
      const f = surface.frameAt(face, m, a);
      const top = vadd(f.origin, vmul(f.normal, -(cfg.drop ?? 0.35) - h));
      part.cylinder(top, vadd(top, [0, -h, 0]), r, 10);
      n++;
    }
  }
  return n;
}

/** Translucent massing box so a roof-only view still reads as a building. */
export function buildBuildingVolume(part, surface, spec) {
  const { width: W, depth: D } = spec.footprint;
  const h = surface.hEave - 0.15;
  const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
  const c = (x, y, z) => [x, y, z];
  const y0 = 0.12, y1 = Math.max(0.4, h);
  // four walls (double sided) + floor
  const walls = [
    [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)],
    [c(x1, y0, z0), c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0)],
    [c(x1, y0, z1), c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1)],
    [c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1), c(x0, y1, z0)],
  ];
  for (const w of walls) part.quad2(w[0], w[1], w[2], w[3]);
  return { W, D, h: y1 };
}
