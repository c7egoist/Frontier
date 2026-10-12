// Procedural four-wheel car model. The car faces -Z; its +X is the right-hand side.

import * as THREE from 'three';

const shared = {};
function mats() {
  if (shared.ready) return shared;
  shared.ready = true;
  shared.dark = new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.5, metalness: 0.3 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.9, metalness: 0 });
  shared.hub = new THREE.MeshStandardMaterial({ color: 0x9aa4c0, roughness: 0.3, metalness: 0.9, emissive: 0x2a3550, emissiveIntensity: 0.6 });
  shared.glass = new THREE.MeshStandardMaterial({ color: 0x0c1430, roughness: 0.05, metalness: 0.9, emissive: 0x0a2050, emissiveIntensity: 0.6 });
  shared.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf6ff).multiplyScalar(3), toneMapped: false });
  return shared;
}

// Squash the front of a subdivided box into a wedge nose.
function wedge(geo, halfL, nose = 1) {
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = Math.max(0, Math.min(1, (-z - halfL * 0.2) / (halfL * 0.8)));
    if (t > 0) {
      p.setY(i, p.getY(i) * (1 - 0.55 * t * nose));
      p.setX(i, p.getX(i) * (1 - 0.35 * t * nose));
    }
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function buildCarMesh(color, accent, { scale = 1 } = {}) {
  const m = mats();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.65, emissive: new THREE.Color(color).multiplyScalar(0.06) });
  const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.2), toneMapped: false });

  // Main hull
  const hullGeo = wedge(new THREE.BoxGeometry(2.0, 0.5, 4.5, 1, 1, 8), 2.25);
  const hull = new THREE.Mesh(hullGeo, paint);
  hull.position.y = 0.62;
  body.add(hull);

  // Side skirts in dark
  for (const sx of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 3.6), m.dark);
    sk.position.set(sx * 1.02, 0.36, 0.1);
    body.add(sk);
  }

  // Cabin
  const cabinGeo = wedge(new THREE.BoxGeometry(1.5, 0.52, 2.1, 1, 1, 4), 1.05, 0.6);
  const cabin = new THREE.Mesh(cabinGeo, m.glass);
  cabin.position.set(0, 1.12, 0.35);
  body.add(cabin);

  // Roof spoiler and fins
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.42), paint);
  spoiler.position.set(0, 1.34, 2.05);
  body.add(spoiler);
  for (const sx of [-0.8, 0.8]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.3), paint);
    fin.position.set(sx, 1.15, 2.0);
    body.add(fin);
  }

  // Underglow
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.2),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  root.add(glow);

  // Headlights (nose is -Z)
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.06), m.head);
    h.position.set(sx, 0.7, -2.27);
    body.add(h);
  }
  // Taillights (rear is +Z)
  const brakeMats = [];
  for (const sx of [-0.7, 0.7]) {
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1a3c).multiplyScalar(1.4), toneMapped: false });
    brakeMats.push(bm);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.06), bm);
    t.position.set(sx, 0.78, 2.27);
    body.add(t);
  }
  // Accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 4.3), accentMat);
  stripe.position.set(0, 0.9, 0.0);
  body.add(stripe);

  // Wheels: pivot (steer) -> spin group -> tyre + hub
  const wheels = [];
  const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 18);
  tyreGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.4, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const corners = [
    { x: -1.08, z: -1.45, front: true },
    { x: 1.08, z: -1.45, front: true },
    { x: -1.08, z: 1.5, front: false },
    { x: 1.08, z: 1.5, front: false },
  ];
  for (const c of corners) {
    const pivot = new THREE.Group();
    pivot.position.set(c.x, 0.42, c.z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, m.tire);
    const hub = new THREE.Mesh(hubGeo, m.hub);
    spin.add(tyre, hub);
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front: c.front });
  }

  root.scale.setScalar(scale);
  return { root, body, wheels, brakeMats, glow };
}

// Simple shadow blob under cars.
export function buildShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.7)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Pose an object on the track. f is a track frame (p, t, r, u), x lateral, h height above
// the centreline, yaw = nose angle relative to the track tangent (positive turns right).
// The object's local -Z is its nose and local +X is its right-hand side.
export function poseOnTrack(obj, f, x, h, yaw = 0) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const T = new THREE.Vector3(...f.t), R = new THREE.Vector3(...f.r), U = new THREE.Vector3(...f.u);
  const fwd = T.clone().multiplyScalar(c).addScaledVector(R, sn).normalize();
  const Z = fwd.clone().negate();
  const X = new THREE.Vector3().crossVectors(U, Z).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  obj.position.set(
    f.p[0] + f.r[0] * x + f.u[0] * h,
    f.p[1] + f.r[1] * x + f.u[1] * h,
    f.p[2] + f.r[2] * x + f.u[2] * h,
  );
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  return obj;
}

// Orient an object whose local X is the track's right and local Z is the track's
// backward direction (used for trains and boxes that lie across or along the road).
export function poseFrame(obj, f, x, h, { alongTrack = true } = {}) {
  const T = new THREE.Vector3(...f.t), R = new THREE.Vector3(...f.r), U = new THREE.Vector3(...f.u);
  const m = alongTrack
    ? new THREE.Matrix4().makeBasis(R, U, T.clone().negate())
    : new THREE.Matrix4().makeBasis(R, U, T.clone().negate());
  obj.quaternion.setFromRotationMatrix(m);
  obj.position.set(
    f.p[0] + f.r[0] * x + f.u[0] * h,
    f.p[1] + f.r[1] * x + f.u[1] * h,
    f.p[2] + f.r[2] * x + f.u[2] * h,
  );
  return obj;
}
