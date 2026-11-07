import { clamp } from './utils.js';

/**
 * Analytic track path: a chain of straights and constant-radius 90° arcs.
 * The path is the rail every element of the world is built on.
 *
 * heading yaw: forward = (sin yaw, cos yaw) in XZ, up = +Y
 * right (screen right of a traveller) = (-cos yaw, sin yaw)
 * positive turn angle = left-hand turn.
 */
export class TrackPath {
  constructor(x = 0, y = 0, z = 0, yaw = 0) {
    this.segs = [];
    this.s = 0;
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
  }

  get total() { return this.s; }

  rightAt(yaw, out = {}) {
    out.rx = -Math.cos(yaw);
    out.rz = Math.sin(yaw);
    return out;
  }

  addStraight(len, dy = 0, meta = {}) {
    const seg = {
      type: 'straight',
      s0: this.s,
      x0: this.x, y0: this.y, z0: this.z, yaw0: this.yaw,
      len, dy, meta,
      angle: 0, radius: 0, k: 0,
      bankTan: 0,
    };
    seg.s1 = seg.s0 + len;
    this.x += Math.sin(this.yaw) * len;
    this.z += Math.cos(this.yaw) * len;
    this.y += dy;
    this.s = seg.s1;
    this.segs.push(seg);
    return seg;
  }

  addTurn(angle, radius, dy = 0, meta = {}) {
    const len = Math.abs(angle) * radius;
    const sgn = angle >= 0 ? 1 : -1;
    const rx0 = -Math.cos(this.yaw);
    const rz0 = Math.sin(this.yaw);
    const cx = this.x - rx0 * radius * sgn;
    const cz = this.z - rz0 * radius * sgn;
    const bankAngle = meta.bank !== undefined ? meta.bank : 0.20;
    const seg = {
      type: 'turn',
      s0: this.s,
      x0: this.x, y0: this.y, z0: this.z, yaw0: this.yaw,
      len, dy, meta, angle, radius, sgn,
      cx, cz,
      k: sgn / radius,
      bankTan: Math.tan(bankAngle),
    };
    const yaw1 = this.yaw + angle;
    this.x = cx + -Math.cos(yaw1) * radius * sgn;
    this.z = cz + Math.sin(yaw1) * radius * sgn;
    this.y += dy;
    this.yaw = yaw1;
    this.s = seg.s0 + len;
    seg.s1 = this.s;
    this.segs.push(seg);
    return seg;
  }

  /** last segment starts before s */
  segAt(s) {
    const segs = this.segs;
    if (!segs.length) return null;
    if (s <= segs[0].s0) return segs[0];
    const last = segs[segs.length - 1];
    if (s >= last.s1) return last;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return segs[lo];
  }

  /** index of the segment containing s */
  segIndexAt(s) {
    const segs = this.segs;
    if (!segs.length) return -1;
    if (s <= segs[0].s0) return 0;
    if (s >= segs[segs.length - 1].s1) return segs.length - 1;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /** Pose at distance s along the path. */
  frameAt(s) {
    const seg = this.segAt(s);
    if (!seg) {
      return { x: 0, y: 0, z: 0, yaw: 0, rx: -1, rz: 0, fx: 0, fz: 1, k: 0, bank: 0 };
    }
    const u = clamp((s - seg.s0) / seg.len, 0, 1);
    if (seg.type === 'straight') {
      const fx = Math.sin(seg.yaw0), fz = Math.cos(seg.yaw0);
      return {
        x: seg.x0 + fx * seg.len * u,
        y: seg.y0 + seg.dy * u,
        z: seg.z0 + fz * seg.len * u,
        yaw: seg.yaw0,
        rx: -Math.cos(seg.yaw0),
        rz: Math.sin(seg.yaw0),
        fx, fz,
        k: 0,
        bank: 0,
      };
    }
    const yaw = seg.yaw0 + seg.angle * u;
    const sgn = seg.sgn;
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    return {
      x: seg.cx + rx * seg.radius * sgn,
      y: seg.y0 + seg.dy * u,
      z: seg.cz + rz * seg.radius * sgn,
      yaw,
      rx, rz,
      fx: Math.sin(yaw), fz: Math.cos(yaw),
      k: seg.k,
      bank: seg.bankTan * Math.min(1, Math.min(u * 5, (1 - u) * 5)),
    };
  }
}
