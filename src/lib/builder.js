// Geometry accumulator. Parts are appended with their material; on build() they
// are merged into one mesh per material so a building is a few dozen draw calls
// (or a few dozen GLB primitives) instead of thousands.
import * as THREE from 'three';
import { mergeList } from './geom.js';

export class Builder {
  constructor(materials) {
    this.materials = materials;
    this.buckets = new Map(); // material.uuid -> {material, geos: [], name}
    this.stats = { parts: 0, triangles: 0, meshes: 0 };
    this.unit = 1; // 1 unit = 1 metre
    this._stack = [new THREE.Matrix4()];
  }

  mat(role, opts) {
    return this.materials.get(role, opts);
  }

  /** Everything added while the transform is pushed is built in local space. */
  pushMatrix(m) {
    const top = this._stack[this._stack.length - 1];
    this._stack.push(new THREE.Matrix4().multiplyMatrices(top, m));
    return this;
  }

  /** Convenience: translate + rotate scope. */
  pushPlacement(x, y, z, rotY = 0) {
    return this.pushMatrix(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z));
  }

  popMatrix() {
    if (this._stack.length > 1) this._stack.pop();
    return this;
  }

  get _top() {
    return this._stack[this._stack.length - 1];
  }

  /** Append an already-transformed geometry with a material. */
  add(material, geo, name) {
    if (!geo || !material) return this;
    const m = this._top;
    const identity = m.elements[0] === 1 && m.elements[5] === 1 && m.elements[10] === 1 && m.elements[12] === 0 && m.elements[13] === 0 && m.elements[14] === 0;
    if (!identity) {
      geo.applyMatrix4(m);
      if (geo.index) geo.index.needsUpdate = true;
      geo.attributes.position.needsUpdate = true;
      if (geo.attributes.normal) geo.attributes.normal.needsUpdate = true;
    }
    let b = this.buckets.get(material.uuid);
    if (!b) {
      b = { material, geos: [], name: name || material.name || 'part' };
      this.buckets.set(material.uuid, b);
    }
    b.geos.push(geo);
    this.stats.parts++;
    const pos = geo.attributes?.position;
    if (pos) this.stats.triangles += Math.floor((geo.index ? geo.index.count : pos.count) / 3);
    return this;
  }

  /** Box at a position (centre by default). */
  box(material, size, pos = [0, 0, 0], rot = null, anchor = 'center') {
    const [w, h, d] = size;
    const g = new THREE.BoxGeometry(w, h, d);
    let py = pos[1];
    if (anchor === 'bottom') py += h / 2;
    if (rot) {
      const e = new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      g.applyQuaternion(new THREE.Quaternion().setFromEuler(e));
    }
    g.translate(pos[0], py, pos[2]);
    return this.add(material, g);
  }

  /** Cylinder. opts: {r, rt, rb, h, seg, open} */
  cyl(material, opts, pos = [0, 0, 0], rot = null) {
    const seg = opts.seg ?? 12;
    const g = new THREE.CylinderGeometry(opts.rt ?? opts.r, opts.rb ?? opts.r, opts.h, seg, 1, !!opts.open);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)));
    g.translate(pos[0], pos[1], pos[2]);
    return this.add(material, g);
  }

  /** Place an arbitrary geometry (local scale/rot/pos) then add it. */
  place(material, geo, pos = [0, 0, 0], rot = null, scale = null) {
    if (scale) {
      if (typeof scale === 'number') geo.scale(scale, scale, scale);
      else geo.scale(scale[0], scale[1], scale[2]);
    }
    if (rot) geo.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)));
    geo.translate(pos[0], pos[1], pos[2]);
    return this.add(material, geo);
  }

  /** Raw geometry add without transforms. */
  raw(material, geo) {
    return this.add(material, geo);
  }

  /** Merge everything into meshes under a group. */
  build(groupName = 'Building') {
    const group = new THREE.Group();
    group.name = groupName;
    let i = 0;
    for (const b of this.buckets.values()) {
      const merged = mergeList(b.geos);
      b.geos.length = 0;
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.material);
      const role = b.material.userData?.role || 'mat';
      mesh.name = `${role}__${b.name}`;
      mesh.castShadow = !b.material.transparent && b.material.role !== 'earth';
      mesh.receiveShadow = true;
      if (b.material.transparent && b.material.opacity < 0.6) mesh.castShadow = false;
      group.add(mesh);
      this.stats.meshes++;
    }
    this.buckets.clear();
    return group;
  }

  get triangleCount() {
    return this.stats.triangles;
  }
}

export default Builder;
