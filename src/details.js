// ---------------------------------------------------------------------------
// details.js — street furniture & surface detail builders:
//   • guardrails: corrugated W-beam rail, blockouts, posts, turned-down
//     end terminals (proper corrugated face + flat back)
//   • paving patterns: procedural decals on the pavement strips
//     (concrete slabs / running-bond pavers / gravel stipple)
//   • drainage: inlet grates set into the gutter channel
// ---------------------------------------------------------------------------

import { vSub, vLen, vLerp, clamp, arcLengths } from './math.js';

export const COL = {
  road: '#333333',
  gutter: '#2b2b2b',
  curb: '#737373',
  pavement: '#a3a3a3',
  side: '#888888',
  bottom: '#777777',
  rail: '#cbd5e1',
  railDark: '#9aa7b5',
  post: '#52525b',
  markingWhite: '#d9d9d9',
  markingAmber: '#d8b84a',
  concrete: '#9a9a9a',
  concreteDark: '#6f6f6f',
  girder: '#7d7d7d',
  parapet: '#8f8f8f',
  grate: '#1c1c1c',
  grateSlot: '#060606',
  pattern: '#8c8c8c',
  water: '#17333d',
};

const patch = (name, grid, fill_color, alpha = 1) => ({ name, grid, fill_color, alpha });
const patchD = (name, grid, fill_color, alpha = 1) => ({ name, grid, fill_color, alpha, decal: true });
const liftP = (p, lift) => [p[0], p[1], p[2] + lift];

// ---------------------------------------------------------------------------
// Guardrails — corrugated W-beam on posts with blockouts and end terminals.
//
// The rail face (traffic side) is a true corrugated profile: out-lobe at the
// top, in-lobe at mid, out-lobe at the bottom. The back face is flat. Posts
// are square stakes; a blockout spaces the rail off the post. At free ends
// (terminals !== false) the last stretch turns down and flares out — a
// turned-down terminal instead of a raw cut.
// ---------------------------------------------------------------------------

/**
 * @param base      rail base line (on the pavement, near its outer edge)
 * @param normals   per-station plan normals (road space; for a left rail the
 *                  carriageway is toward +normal, the rail toward -normal)
 * @param pointRight true when the rail sits on the right side of travel
 * @param rails     RailSettings { enabled, height, thickness, posts, postSpacing, terminals }
 * @param postDrop  how far posts extend below the base line
 * @param baseInset shift the rail line inward (onto the pavement) this far
 * @param ends      { capStart, capEnd } — turn the rail down at these ends
 */
export function buildGuardRail(base, normals, pointRight, rails, postDrop = 0, baseInset = 0, ends = null) {
  if (!rails || !rails.enabled || rails.height <= 0 || rails.thickness <= 0) return [];
  if (base.length < 2) return [];
  const out = [];
  const s = pointRight ? 1 : -1; // direction from carriageway toward the rail

  // shift the rail line inward (onto the pavement) so posts embed in structure
  const pts = base.map((p, i) => {
    const n = normals[i];
    return [p[0] + n[0] * s * baseInset, p[1] + n[1] * s * baseInset, p[2]];
  });

  // arc distances along the (possibly inset) base line
  const dists = [0];
  for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + vLen(vSub(pts[i], pts[i - 1])));
  const total = dists[dists.length - 1];
  if (total <= 1e-6) return [];

  // turned-down terminal zones at the ends
  const termLen = rails.terminals === false ? 0 : Math.min(3.2, total * 0.25);
  const termAt = (i) => {
    if (termLen <= 0 || !ends) return null;
    const d0 = dists[i];
    const d1 = total - dists[i];
    if (ends.capStart && d0 < termLen) return 1 - d0 / termLen;
    if (ends.capEnd && d1 < termLen) return 1 - d1 / termLen;
    return null;
  };

  // landing links: bend the rail end onto an exact 3D target (bridge parapet)
  const redirectAt = (i) => {
    if (!ends) return null;
    const d0 = dists[i];
    const d1 = total - dists[i];
    let w = 0;
    let tgt = null;
    const smooth = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
    if (ends.redirectStart && ends.redirectStart.length > 0) {
      const wS = smooth(1 - d0 / ends.redirectStart.length);
      if (wS > w) { w = wS; tgt = ends.redirectStart.target; }
    }
    if (ends.redirectEnd && ends.redirectEnd.length > 0) {
      const wE = smooth(1 - d1 / ends.redirectEnd.length);
      if (wE > w) { w = wE; tgt = ends.redirectEnd.target; }
    }
    return w > 0 ? { w, tgt } : null;
  };

  const h = rails.height;
  const t = rails.thickness;
  // corrugated W-beam face profile: (outward offset, height above base)
  const lobe = Math.min(0.09, t * 0.6);
  const faceProfile = [
    { off: 0, z: h },
    { off: lobe, z: h * 0.82 },
    { off: 0, z: h * 0.62 },
    { off: lobe, z: h * 0.44 },
    { off: 0, z: h * 0.22 },
    { off: lobe, z: h * 0.06 },
    { off: 0, z: 0 },
  ];
  const backOff = -t; // back face flat, on the post side

  const railPoint = (i, off, z) => {
    const n = normals[i];
    let x = pts[i][0] + n[0] * s * off;
    let y = pts[i][1] + n[1] * s * off;
    let zz = pts[i][2] + z;
    const k = termAt(i);
    if (k !== null) {
      // turn down: height eases to near zero, rail flares outward
      zz = pts[i][2] + z * (1 - k * k);
      x += n[0] * s * 0.35 * k;
      y += n[1] * s * 0.35 * k;
    }
    const red = redirectAt(i);
    if (red) {
      x = x + (red.tgt[0] - x) * red.w;
      y = y + (red.tgt[1] - y) * red.w;
      zz = zz + (red.tgt[2] - zz) * red.w;
    }
    return [x, y, zz];
  };

  const frontLines = faceProfile.map((prof) => pts.map((_, i) => railPoint(i, prof.off, prof.z)));
  const backTop = pts.map((_, i) => railPoint(i, backOff, h));
  const backBot = pts.map((_, i) => railPoint(i, backOff, 0));

  // corrugated front face strips
  for (let k = 0; k < faceProfile.length - 1; k++) {
    const a = frontLines[k];
    const b = frontLines[k + 1];
    out.push(patch(`Rail face ${k}`, pointRight ? [b, a] : [a, b], COL.rail));
  }
  // flat back face + top/bottom closing strips
  out.push(patch('Rail back', pointRight ? [backBot, backTop] : [backTop, backBot], COL.railDark));
  out.push(patch('Rail top', [frontLines[0], backTop], COL.railDark));
  out.push(patch('Rail bottom', [backBot, frontLines[frontLines.length - 1]], COL.railDark));

  // posts + blockouts
  if (rails.posts) {
    const postSize = 0.15;
    const ph = postSize / 2;
    const spacing = Math.max(1, rails.postSpacing || 2.4);
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) acc += dists[i] - dists[i - 1];
      const last = i === pts.length - 1;
      if (i !== 0 && !last && acc < spacing) continue;
      acc = 0;
      const n = normals[i];
      const nx = n[0] * s; const ny = n[1] * s;
      // tangent for the post's planform orientation
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0]; let ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-6) { tx = 1; ty = 0; } else { tx /= tl; ty /= tl; }
      // blockout: small spacer between post face and rail back
      const blk = 0.06;
      const cx = pts[i][0] + nx * (t + blk);
      const cy = pts[i][1] + ny * (t + blk);
      const z0 = pts[i][2] - postDrop;
      const z1 = pts[i][2] + h * 0.62;
      const px = (sx, sy) => [cx + nx * sx + tx * sy, cy + ny * sx + ty * sy, 0];
      const c00 = px(-ph, ph); const c01 = px(-ph, -ph);
      const c10 = px(ph, ph); const c11 = px(ph, -ph);
      const q = (c, z) => [c[0], c[1], z];
      out.push(patch('Post', [[q(c00, z0), q(c01, z0)], [q(c00, z1), q(c01, z1)]], COL.post));
      out.push(patch('Post', [[q(c11, z0), q(c10, z0)], [q(c11, z1), q(c10, z1)]], COL.post));
      out.push(patch('Post', [[q(c10, z0), q(c00, z0)], [q(c10, z1), q(c00, z1)]], COL.post));
      out.push(patch('Post', [[q(c01, z0), q(c11, z0)], [q(c01, z1), q(c11, z1)]], COL.post));
      out.push(patch('Post top', [[q(c00, z1), q(c01, z1)], [q(c10, z1), q(c11, z1)]], COL.post));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Paving patterns — procedural decals on a pavement strip.
//   strip: { inner, outer, s, width } — inner/outer edge lines sharing stations
//   patterns: none | slabs | pavers | gravel
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Emit a thin across-strip joint quad at arc position sj between stations i,i+1. */
function jointQuad(out, inner, outer, i, prevS, span, sj, thickness, lift, name) {
  const f0 = clamp((sj - prevS) / span, 0, 1);
  const f1 = clamp((sj + thickness - prevS) / span, 0, 1);
  if (f1 <= f0 + 1e-4) return;
  const a = vLerp(vLerp(inner[i], inner[i + 1], f0), vLerp(outer[i], outer[i + 1], f0), 0);
  const b = vLerp(vLerp(inner[i], inner[i + 1], f1), vLerp(outer[i], outer[i + 1], f1), 0);
  const c = vLerp(vLerp(inner[i], inner[i + 1], f1), vLerp(outer[i], outer[i + 1], f1), 1);
  const d = vLerp(vLerp(inner[i], inner[i + 1], f0), vLerp(outer[i], outer[i + 1], f0), 1);
  out.push(patchD(name, [[liftP(a, lift), liftP(b, lift)], [liftP(d, lift), liftP(c, lift)]], COL.pattern));
}

/** Quad between across-strip fractions f0..f1 at along-strip fraction g0..g1. */
function cellQuad(out, inner, outer, i, g0, g1, f0, f1, lift, name) {
  const a = vLerp(vLerp(inner[i], inner[i + 1], g0), vLerp(outer[i], outer[i + 1], g0), f0);
  const b = vLerp(vLerp(inner[i], inner[i + 1], g1), vLerp(outer[i], outer[i + 1], g1), f0);
  const c = vLerp(vLerp(inner[i], inner[i + 1], g1), vLerp(outer[i], outer[i + 1], g1), f1);
  const d = vLerp(vLerp(inner[i], inner[i + 1], g0), vLerp(outer[i], outer[i + 1], g0), f1);
  out.push(patchD(name, [[liftP(a, lift), liftP(b, lift)], [liftP(d, lift), liftP(c, lift)]], COL.pattern));
}

export function buildPavingPattern(strip, pattern, scale = 1, lift = 0.012) {
  if (!pattern || pattern === 'none') return [];
  const inner = strip.inner;
  const outer = strip.outer;
  const n = Math.min(inner.length, outer.length);
  if (n < 2) return [];
  const s = strip.s;
  const out = [];
  const k = Math.max(0.5, scale || 1);

  if (pattern === 'slabs') {
    // concrete slabs: transverse joints every ~4.5 m + a longitudinal joint
    const joint = 4.5 * k;
    const thickness = 0.05;
    let prevS = s[0];
    let next = joint - (s[0] % joint);
    for (let i = 0; i < n - 1; i++) {
      const s1 = s[i + 1];
      const span = s1 - prevS;
      if (span > 1e-6) {
        while (next <= s1 + 1e-6) {
          jointQuad(out, inner, outer, i, prevS, span, next, thickness, lift, 'Slab joint');
          next += joint;
        }
      }
      prevS = s1;
    }
    if (strip.width > 1.6) {
      // longitudinal joint at mid-width (thin strip along travel)
      for (let i = 0; i < n - 1; i++) {
        cellQuad(out, inner, outer, i, 0, 1, 0.5, 0.512, lift, 'Slab joint L');
      }
    }
    return out;
  }

  if (pattern === 'pavers') {
    // running bond: longitudinal lines at thirds; transverse joints every
    // paver, alternating full-width and half-width (offset by one paver)
    const paver = 0.6 * k;
    const thickness = 0.035;
    const width = strip.width;
    const rows = width > 1.8 ? 3 : 2;
    const fracs = [];
    for (let r = 1; r < rows; r++) fracs.push(r / rows);
    let prevS = s[0];
    let next = paver - (s[0] % paver);
    let row = 0;
    for (let i = 0; i < n - 1; i++) {
      const s1 = s[i + 1];
      const span = s1 - prevS;
      if (span > 1e-6) {
        while (next <= s1 + 1e-6) {
          if (row % 2 === 0) {
            jointQuad(out, inner, outer, i, prevS, span, next, thickness, lift, 'Paver joint');
          } else {
            // half joints between the longitudinal lines, alternating cells
            for (let c = 0; c <= fracs.length; c++) {
              if (c % 2 === 1) continue;
              const f0 = c === 0 ? 0 : fracs[c - 1];
              const f1 = c === fracs.length ? 1 : fracs[c];
              const g0 = clamp((next - prevS) / span, 0, 1);
              const g1 = clamp((next + thickness - prevS) / span, 0, 1);
              if (g1 > g0 + 1e-4) cellQuad(out, inner, outer, i, g0, g1, f0, f1, lift, 'Paver joint');
            }
          }
          next += paver;
          row++;
        }
      }
      prevS = s1;
    }
    // longitudinal lines
    for (const f of fracs) {
      for (let i = 0; i < n - 1; i++) {
        cellQuad(out, inner, outer, i, 0, 1, f, f + 0.012, lift, 'Paver line');
      }
    }
    return out;
  }

  if (pattern === 'gravel') {
    // stipple: small flecks on a deterministic jitter grid
    const cell = 0.35 * k;
    let prevS = s[0];
    let next = cell - (s[0] % cell);
    let seed = 7;
    while (next <= s[n - 1] + 1e-6) {
      // find the station pair containing `next`
      let i = 0;
      while (i < n - 2 && s[i + 1] < next) i++;
      const span = s[i + 1] - s[i];
      if (span > 1e-6) {
        const g = clamp((next - s[i]) / span, 0, 1);
        const across = Math.max(1, Math.round(strip.width / cell));
        for (let c = 0; c < across; c++) {
          seed += 1;
          if (hash01(seed * 3.7) < 0.35) continue; // sparse
          const f0 = c / across + hash01(seed) * 0.25 / across;
          const f1 = f0 + 0.5 / across;
          const len = 0.06 + hash01(seed * 1.3) * 0.08;
          const g1 = clamp((next + len - s[i]) / span, 0, 1);
          cellQuad(out, inner, outer, i, g, g1, f0, f1, lift, 'Gravel fleck');
        }
      }
      next += cell;
    }
    return out;
  }

  return out;
}

/** Prepare a strip descriptor from two edge lines (must share a station count). */
export function makeStrip(inner, outer, frames) {
  const n = Math.min(inner.length, outer.length);
  const s = frames ? frames.slice(0, n).map((f) => f.s) : arcLengths(inner.slice(0, n));
  let wSum = 0;
  for (let i = 0; i < n; i++) wSum += vLen(vSub(outer[i], inner[i]));
  return { inner: inner.slice(0, n), outer: outer.slice(0, n), s, width: wSum / Math.max(1, n) };
}

// ---------------------------------------------------------------------------
// Drainage — inlet grates set into the gutter channel.
//   gutter strip: inner = road edge line, outer = gutter base at the curb.
// ---------------------------------------------------------------------------

export function buildGrates(strip, spacing, length = 0.7, lift = -0.008) {
  const out = [];
  const inner = strip.inner;
  const outer = strip.outer;
  const n = Math.min(inner.length, outer.length);
  if (n < 2 || !(spacing > 0)) return out;
  const s = strip.s;
  let next = spacing - (s[0] % spacing);
  while (next <= s[n - 1] + 1e-6) {
    let i = 0;
    while (i < n - 2 && s[i + 1] < next) i++;
    const span = s[i + 1] - s[i];
    if (span > 1e-6) {
      const f0 = clamp((next - length / 2 - s[i]) / span, 0, 1);
      const f1 = clamp((next + length / 2 - s[i]) / span, 0, 1);
      if (f1 > f0 + 1e-4) {
        const q = (p) => liftP(p, lift);
        const a = vLerp(vLerp(inner[i], inner[i + 1], f0), vLerp(outer[i], outer[i + 1], f0), 0.06);
        const b = vLerp(vLerp(inner[i], inner[i + 1], f1), vLerp(outer[i], outer[i + 1], f1), 0.06);
        const c = vLerp(vLerp(inner[i], inner[i + 1], f1), vLerp(outer[i], outer[i + 1], f1), 0.94);
        const d = vLerp(vLerp(inner[i], inner[i + 1], f0), vLerp(outer[i], outer[i + 1], f0), 0.94);
        out.push(patchD('Grate', [[q(a), q(b)], [q(d), q(c)]], COL.grate));
        // slots across the grate
        const slots = 4;
        for (let k = 1; k < slots; k++) {
          const fk = k / slots;
          const sa = vLerp(a, d, fk);
          const sb = vLerp(b, c, fk);
          const mid = vLerp(inner[i], outer[i], 0.5);
          const sa2 = vLerp(sa, mid, 0.05);
          const sb2 = vLerp(sb, mid, 0.05);
          out.push(patchD('Grate slot', [[q(sa), q(sa2)], [q(sb), q(sb2)]], COL.grateSlot));
        }
      }
    }
    next += spacing;
  }
  return out;
}
