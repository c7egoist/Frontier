// ============================================================================
// parts.js — ridge caps (noshigawara), onigawara, chigi/katsuogi, barge
// boards, gable walls, wall plates (keta), rafters (taruki), fascia, walls
// ============================================================================
import { clamp, lerp, DEG } from './core.js';

// --- ridge cap: noshigawara half-round tiles + plaster fillet ---------------
export function ridgeCap(buf, pts, opts) {
  const { colors, rCap = 0.105, fillet = true, taperEnd = 0.85 } = opts;
  // plaster fillet each side (shironuri) — sits between tiles and roof plane
  if (fillet) {
    for (const s of [1, -1]) {
      const rows = [];
      for (const p of pts) {
        const low = { x: p.x + s * (rCap * 1.55), y: p.y, z: p.z + 0.004 };
        const hi = { x: p.x + s * rCap * 0.35, y: p.y, z: p.z + rCap * 0.45 };
        rows.push([low, hi]);
      }
      buf.ribbon(rows, colors.plaster, () => colors.plaster);
    }
  }
  // cap tiles: stacked half cylinders along the polyline
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const u = i / (pts.length - 1);
    const r = lerp(rCap, rCap * taperEnd, u);
    buf.tube([a.x, a.y, a.z + r * 0.25], [b.x, b.y, b.z + r * 0.25], r * 1.06, r, {
      col: colors.ridge, sides: 8, up: [0, 0, 1], rings: 1,
    });
  }
}

// --- hip ridge cap with small end ornament ---------------------------------
export function hipCap(buf, pts, opts) {
  const { colors } = opts;
  ridgeCap(buf, pts, { colors, rCap: opts.rCap ?? 0.085, fillet: opts.fillet ?? false, taperEnd: 0.7 });
  if (opts.endOrnament) {
    const p = pts[pts.length - 1];
    buf.tube([p.x, p.y, p.z], [p.x, p.y, p.z - 0.05], 0.075, 0.06,
      { col: colors.ridge, sides: 7, up: [0, 0, 1], rings: 1, caps: true, capCol: colors.tileDark });
  }
}

// --- onigawara (ridge-end tile with demon face) + toribusuma ---------------
let oniTexCache = null;
function oniTexture(THREE, faceStyle) {
  if (oniTexCache) return oniTexCache;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 300;
  const g = c.getContext('2d');
  g.fillStyle = '#33343a'; g.fillRect(0, 0, 256, 300);
  // slab rim
  g.strokeStyle = '#211f22'; g.lineWidth = 14; g.strokeRect(7, 7, 242, 286);
  // face plate
  g.fillStyle = '#45464e';
  g.beginPath();
  g.moveTo(40, 90); g.quadraticCurveTo(30, 40, 78, 36);
  g.lineTo(178, 36); g.quadraticCurveTo(226, 40, 216, 90);
  g.lineTo(204, 210); g.quadraticCurveTo(200, 252, 160, 258);
  g.lineTo(96, 258); g.quadraticCurveTo(56, 252, 52, 210);
  g.closePath(); g.fill();
  g.strokeStyle = '#26262b'; g.lineWidth = 5; g.stroke();
  // horns
  g.fillStyle = '#45464e';
  g.beginPath(); g.moveTo(70, 44); g.quadraticCurveTo(52, 10, 84, 6); g.quadraticCurveTo(88, 30, 96, 40); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(186, 44); g.quadraticCurveTo(204, 10, 172, 6); g.quadraticCurveTo(168, 30, 160, 40); g.closePath(); g.fill(); g.stroke();
  // brows
  g.strokeStyle = '#1d1c20'; g.lineWidth = 11; g.lineCap = 'round';
  g.beginPath(); g.moveTo(78, 110); g.lineTo(116, 128); g.stroke();
  g.beginPath(); g.moveTo(178, 110); g.lineTo(140, 128); g.stroke();
  // eyes
  g.fillStyle = '#e8e3d2';
  g.beginPath(); g.arc(98, 148, 17, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(158, 148, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#17161a';
  g.beginPath(); g.arc(101, 152, 8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(155, 152, 8, 0, Math.PI * 2); g.fill();
  // nose + grim mouth with fangs
  g.strokeStyle = '#1d1c20'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(128, 160); g.lineTo(124, 184); g.stroke();
  g.beginPath(); g.moveTo(88, 204); g.quadraticCurveTo(128, 236, 168, 204); g.stroke();
  g.fillStyle = '#e8e3d2';
  g.beginPath(); g.moveTo(94, 207); g.lineTo(104, 222); g.lineTo(112, 208); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(162, 207); g.lineTo(152, 222); g.lineTo(144, 208); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  oniTexCache = tex;
  return tex;
}

export function onigawara(THREE, buf, mats, pos, dirX, opts) {
  // pos: base centre at the ridge end, on the ridge line; dirX: +1/-1 outward
  const { w = 0.4, h = 0.62, t = 0.055, colors } = opts;
  const g = new THREE.Group();
  g.position.set(pos.x, pos.y, pos.z);
  // slab (textured, standing in the plane perpendicular to the ridge axis)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });
  if (typeof document !== 'undefined') mat.map = oniTexture(THREE);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(t, w, h), mat);
  slab.position.set(0, 0, h / 2 - 0.02);
  slab.rotation.y = dirX < 0 ? Math.PI : 0;
  // toribusuma: small cylinder poking above the onigawara
  const tori = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: colors.ridgeCol, roughness: 0.85 })
  );
  tori.position.set(-dirX * t, 0, h + 0.02);
  g.add(slab, tori);
  return g;
}

// --- chigi (crossed ridge battens) + katsuogi (ridge logs) ------------------
export function chigi(buf, x, y0, zTop, opts) {
  const { colors, h = 0.72 } = opts;
  const col = colors.woodLight;
  for (const s of [1, -1]) {
    const ang = s * 17 * DEG;
    const dx = Math.sin(ang) * 0, dy = Math.cos(ang) * (h / 2), dz = Math.cos(ang) * (h / 2);
    // boards stand in the gable plane (YZ), crossing at the ridge
    const c = [x, 0, zTop + h / 2 - 0.02];
    const axis = [0, Math.sin(ang), Math.cos(ang)];
    buf.box(c, [1, 0, 0], axis, [0, Math.cos(ang), -Math.sin(ang)], 0.035, 0.015, h / 2, col);
  }
}
export function katsuogi(buf, x, zTop, opts) {
  const { colors, len = 0.56, r = 0.055 } = opts;
  buf.tube([x, -len / 2, zTop + r * 0.7], [x, len / 2, zTop + r * 0.7], r, r,
    { col: colors.woodLight, sides: 8, up: [0, 0, 1], rings: 1, caps: true, capCol: colors.woodLight });
}

// --- barge board (hafu-ita) along a gable rake polyline ---------------------
export function bargeBoard(buf, pts, colors, opts = {}) {
  buf.plank(pts, [0, 0, 1], opts.width ?? 0.16, 0.032, opts.col ?? colors.wood);
}

// --- gable wall (fills triangle under gable roof) ---------------------------
// topFn(y) = roof underside height; builds a vertical strip from wallTop
export function gableWallStrip(buf, x, ySamples, topFn, wallTop, col) {
  for (let i = 0; i < ySamples.length - 1; i++) {
    const y0 = ySamples[i], y1 = ySamples[i + 1];
    const t0 = Math.max(topFn(y0), wallTop + 0.005), t1 = Math.max(topFn(y1), wallTop + 0.005);
    if (t0 <= wallTop + 0.006 && t1 <= wallTop + 0.006) continue;
    const e = 0.02; // embed into roof
    buf.quad(
      [x, y0, wallTop], [x, y1, wallTop],
      [x, y1, t1 + e], [x, y0, t0 + e], col, [1, 0, 0]);
  }
}

// --- walls, wall plate (keta) -----------------------------------------------
export function wallsAndPlate(buf, dim, colors, plateTop, plateH) {
  const { L, D, wallH } = dim;
  const H = plateTop - plateH;              // wall body up to underside of plate
  buf.box([0, 0, H / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], L / 2, D / 2, H / 2, colors.wall);
  // keta wall plate around the top perimeter
  const ph = plateH / 2;
  buf.box([0, D / 2 - 0.05, plateTop - ph], [1, 0, 0], [0, 0, 1], [0, 1, 0], L / 2, 0.06, ph, colors.woodPlate);
  buf.box([0, -D / 2 + 0.05, plateTop - ph], [1, 0, 0], [0, 0, 1], [0, 1, 0], L / 2, 0.06, ph, colors.woodPlate);
  buf.box([L / 2 - 0.05, 0, plateTop - ph], [0, 1, 0], [0, 0, 1], [1, 0, 0], D / 2, 0.06, ph, colors.woodPlate);
  buf.box([-L / 2 + 0.05, 0, plateTop - ph], [0, 1, 0], [0, 0, 1], [1, 0, 0], D / 2, 0.06, ph, colors.woodPlate);
  // corner posts + a hint of engawa boards at the base
  for (const sx of [1, -1]) for (const sy of [1, -1])
    buf.box([sx * (L / 2 - 0.09), sy * (D / 2 - 0.09), H / 2], [0, 0, 1], [1, 0, 0], [0, 1, 0],
      H / 2, 0.09, 0.09, colors.wood);
}

// --- rafters (taruki) under the overhang ------------------------------------
export function rafters(buf, field, dim, opts) {
  const { colors, spacing = 0.17, slabT, zAt } = opts;
  const halfD = dim.D / 2, halfL = dim.L / 2;
  const Ov = dim.ov, rOv = dim.rakeOv;
  const rW = 0.024, rH = 0.034;
  const col = colors.wood;
  const put = (p0, p1) => {
    const z0 = zAt(p0[0], p0[1]) - slabT, z1 = zAt(p1[0], p1[1]) - slabT;
    buf.box([(p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (z0+z1)/2],
      [(p1[0]-p0[0]), (p1[1]-p0[1]), (z1-z0)],
      [0,0,1], [0,0,0], 0, 0, 0, col); // replaced below with plank()
  };
  // long sides (rafters run across depth)
  const n = Math.floor((dim.L - 0.2) / spacing);
  for (const s of [1, -1]) {
    for (let i = 0; i <= n; i++) {
      const x = -dim.L / 2 + 0.1 + (i / n) * (dim.L - 0.2);
      const y0 = s * (halfD - 0.08), y1 = s * (halfD + Ov + 0.03);
      const a = { x, y: y0, z: zAt(x, y0) - slabT }, b = { x, y: y1, z: zAt(x, y1) - slabT };
      rafterBox(buf, a, b, rW, rH, col);
    }
  }
  // short sides for hipped forms (flow is along x at the ends)
  if (field.type !== 'kirizuma') {
    const zEnd = opts.zAtEnd || opts.zAt;
    const m = Math.floor((dim.D - 0.2) / spacing);
    for (const s of [1, -1]) {
      for (let i = 0; i <= m; i++) {
        const y = -dim.D / 2 + 0.1 + (i / m) * (dim.D - 0.2);
        const x0 = s * (halfL - 0.08), x1 = s * (halfL + rOv + 0.03);
        const a = { x: x0, y, z: zEnd(x0, y) - slabT }, b = { x: x1, y, z: zEnd(x1, y) - slabT };
        rafterBox(buf, a, b, rW, rH, col);
      }
    }
  }
}
function rafterBox(buf, a, b, w, h, col) {
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, cz = (a.z + b.z) / 2;
  let u = [b.x - a.x, b.y - a.y, b.z - a.z];
  const l = Math.hypot(...u);
  u = [u[0] / l, u[1] / l, u[2] / l];
  const up = [0, 0, 1];
  let wv = [u[1] * up[2] - u[2] * up[1], u[2] * up[0] - u[0] * up[2], u[0] * up[1] - u[1] * up[0]];
  const wl = Math.hypot(...wv) || 1;
  wv = [wv[0] / wl, wv[1] / wl, wv[2] / wl];
  buf.box([cx, cy, cz], u, wv, up, l / 2, w / 2, h / 2, col);
}

// --- fascia board (noki-pan) around the eave edge ---------------------------
export function fascia(buf, pts, colors, col) {
  buf.plank(pts, [0, 0, 1], 0.032, 0.15, col ?? colors.fascia);
}
