// Triangle accumulator. Geometry is grouped by material key and owner id, so the renderer can
// give each material its own texture / colour and the OBJ writer can name groups per owner.

export class MeshBuilder {
  constructor() {
    this.groups = new Map();
    this.triCount = 0;
    this.skipped = 0;
  }

  _data(mat, owner) {
    const k = `${mat}\u0001${owner}`;
    let g = this.groups.get(k);
    if (!g) {
      g = { mat, owner, data: [] };
      this.groups.set(k, g);
    }
    return g.data;
  }

  tri(mat, owner, a, b, c) {
    for (const p of [a, b, c]) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
        this.skipped++;
        return;
      }
    }
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-18) return; // degenerate
    const d = this._data(mat, owner);
    d.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.triCount++;
  }

  quad(mat, owner, a, b, c, d) {
    this.tri(mat, owner, a, b, c);
    this.tri(mat, owner, a, c, d);
  }

  /** [{mat, owner, positions: Float32Array}] */
  chunks() {
    const out = [];
    for (const g of this.groups.values()) {
      if (!g.data.length) continue;
      out.push({ mat: g.mat, owner: g.owner, positions: new Float32Array(g.data) });
    }
    return out;
  }
}
