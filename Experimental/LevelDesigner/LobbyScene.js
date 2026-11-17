// Scene objects for level entities and the configurator's hotspot layer.
//   buildEntity    THREE node for an entity record (vehicle, turntable, primitive, static mesh); the root carries
//                  userData.componentId = record id, which is what Stage.pick reports
//   paintVehicle   writes the vehicle colour slots into its materials (clear-coated paint, tinted glass, emissive
//                  headlights) without rebuilding geometry
//   HotspotLayer   the configurator's tiny dots (constant screen size sprites that ride the car) and, for the open
//                  hotspot, its swatch strip along the bottom of the view. Sprites on the GPU; no DOM, no lines.
import { THREE, renderGeometry, assetSlots, meshObject } from '../Shared/Studio/Render.js';
import { VEHICLE_SLOTS } from './LevelDocument.js';
import { VEHICLE_SHEET } from '../ComponentViewer/Blueprint.js';

const DEG = Math.PI / 180;

export function applyTransform(node, t) {
  node.position.fromArray(t.location);
  node.rotation.set(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG);
  node.scale.fromArray(t.scale);
}

// --------------------------------------------------------------------------------------------------------- vehicle
const SLOT_OF_FAMILY = Object.fromEntries(Object.entries(VEHICLE_SLOTS).flatMap(([slot, s]) => s.families.map((f) => [f, slot])));

function vehicleMaterial(slot, family) {
  const base = { side: THREE.DoubleSide };
  if (family === 6) return new THREE.MeshPhysicalMaterial({ ...base, color: slot.color, roughness: 0.34, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  if (family === 7) return new THREE.MeshPhysicalMaterial({ ...base, color: slot.color, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 });
  if (family === 10) return new THREE.MeshStandardMaterial({ ...base, color: slot.color, roughness: 0.28, metalness: 1 });
  const m = new THREE.MeshStandardMaterial({ ...base, color: slot.color, roughness: slot.roughness, metalness: slot.metalness });
  if (slot.emissive) { m.emissive = new THREE.Color(slot.emissive); m.emissiveIntensity = 1.4; }
  return m;
}

function vehiclePart(asset) {
  const slots = assetSlots(asset);
  const mesh = new THREE.Mesh(renderGeometry(asset), slots.map((s) => vehicleMaterial(s, s.family)));
  mesh.userData.families = slots.map((s) => s.family);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// The ControlVehicle laid out as the Component Viewer's blueprint does: body at the ground offset, wheels at the
// axle mounts (Vehicle Lab Z-up → Y-up: x, y, z → x, z, −y), rims inside the tyres, the wing on its dock.
export function buildVehicle(parts, props) {
  const root = new THREE.Group();
  root.name = 'ControlVehicle';
  const body = vehiclePart(parts.body);
  body.position.y = VEHICLE_SHEET.groundOffset;
  root.add(body);
  for (const m of VEHICLE_SHEET.axleMount) {
    const tyre = vehiclePart(parts.tyre);
    tyre.position.set(m[0], VEHICLE_SHEET.groundOffset + m[2], -m[1]);
    if (m[1] < 0) tyre.rotation.y = Math.PI;
    tyre.add(vehiclePart(parts.rim));
    root.add(tyre);
  }
  if (parts.wing) {
    const wing = vehiclePart(parts.wing);
    wing.name = 'RearWing';
    wing.position.set(-2.9822, VEHICLE_SHEET.groundOffset + 0.8367, 0);
    wing.visible = props.wing !== false;
    root.add(wing);
    root.userData.wing = wing;
  }
  paintVehicle(root, props.colours);
  return root;
}

export function paintVehicle(root, colours) {
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.families) return;
    o.userData.families.forEach((family, i) => {
      const slot = SLOT_OF_FAMILY[family];
      if (!slot || !colours[slot]) return;
      const m = o.material[i];
      m.color.set(colours[slot]);
      if (family === 13) { m.emissive.set(colours[slot]); m.emissiveIntensity = 1.6; }
    });
  });
}

// -------------------------------------------------------------------------------------------------------- entities
function primitiveGeometry(shape) {
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(0.5, 48, 24);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function buildEntity(record, { parts, assets }) {
  let root;
  if (record.type === 'Vehicle') {
    root = parts ? buildVehicle(parts, record.props) : new THREE.Group();
  } else if (record.type === 'Turntable') {
    root = new THREE.Group();
    const r = record.props.radius;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.004, 0.012, 128), new THREE.MeshPhysicalMaterial({ color: record.props.color, roughness: 0.28, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
    disc.position.y = 0.006;
    disc.receiveShadow = true;
    const inlay = new THREE.Mesh(new THREE.RingGeometry(r - 0.07, r - 0.04, 128), new THREE.MeshStandardMaterial({ color: new THREE.Color(record.props.color).multiplyScalar(0.86), roughness: 0.5 }));
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = 0.0125;
    inlay.receiveShadow = true;
    root.add(disc, inlay);
  } else if (record.type === 'Primitive') {
    root = new THREE.Group();
    const mesh = new THREE.Mesh(primitiveGeometry(record.props.shape), new THREE.MeshStandardMaterial({ color: record.props.color, roughness: record.props.roughness, metalness: record.props.metalness }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  } else if (record.type === 'StaticMesh') {
    const asset = assets && assets.get(record.props.asset);
    root = asset ? meshObject(asset) : new THREE.Group();
  } else {
    root = new THREE.Group();
  }
  root.userData.componentId = record.id;
  root.name = record.name;
  applyTransform(root, record.transform);
  return root;
}

// ---------------------------------------------------------------------------------------------------- hotspot dots
function discTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let dotTex = null, ringTex = null;
const swatchTex = new Map();

function dotTexture() {
  return dotTex || (dotTex = discTexture((g) => {
    g.shadowColor = 'rgba(20,30,45,0.45)'; g.shadowBlur = 14;
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(64, 64, 19, 0, Math.PI * 2); g.fill();
  }));
}

function ringTexture() {
  return ringTex || (ringTex = discTexture((g) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  }));
}

function swatchTexture(color) {
  if (swatchTex.has(color)) return swatchTex.get(color);
  const t = discTexture((g) => {
    g.shadowColor = 'rgba(10,15,25,0.5)'; g.shadowBlur = 12;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = color;
    g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.fill();
  });
  swatchTex.set(color, t);
  return t;
}

const spriteMaterial = (map, depthTest = true) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest, sizeAttenuation: false });

export class HotspotLayer {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.group.name = 'Hotspots';
    stage.overlay.add(this.group);
    this.dots = new Map();          // id → { sprite, ring, hotspot }
    this.swatches = [];             // [{ sprite, index }]
    this.open = null;               // hotspot id whose swatches show
    this.hover = null;
    this.selected = null;
    this.frameOf = () => null;      // hotspot → THREE.Matrix4 of its target entity (set by the Designer)
    this.time = 0;
    stage.frameCallbacks.add((dt) => this.tick(dt));
  }

  sync(hotspots) {
    const keep = new Set(hotspots.map((h) => h.id));
    for (const [id, d] of this.dots) if (!keep.has(id)) { this.group.remove(d.sprite, d.ring); this.dots.delete(id); }
    hotspots.forEach((h, i) => {
      let d = this.dots.get(h.id);
      if (!d) {
        const sprite = new THREE.Sprite(spriteMaterial(dotTexture()));
        const ring = new THREE.Sprite(spriteMaterial(ringTexture()));
        sprite.renderOrder = 30; ring.renderOrder = 29;
        sprite.userData.hotspotId = h.id;
        d = { sprite, ring, phase: i * 0.37 };
        this.dots.set(h.id, d);
        this.group.add(sprite, ring);
      }
      d.hotspot = h;
    });
    if (this.open && !keep.has(this.open)) this.close();
    else if (this.open) this.buildSwatches();
  }

  anchorWorld(h) {
    const p = new THREE.Vector3().fromArray(h.anchor);
    const m = this.frameOf(h);
    return m ? p.applyMatrix4(m) : p;
  }

  openHotspot(id) {
    this.open = id;
    this.buildSwatches();
  }

  close() {
    this.open = null;
    for (const s of this.swatches) this.group.remove(s.sprite);
    this.swatches = [];
  }

  buildSwatches() {
    for (const s of this.swatches) this.group.remove(s.sprite);
    this.swatches = [];
    const d = this.dots.get(this.open);
    if (!d) return;
    d.hotspot.options.forEach((o, index) => {
      const sprite = new THREE.Sprite(spriteMaterial(swatchTexture(o.color), false));
      sprite.renderOrder = 40;
      sprite.userData.swatch = index;
      this.swatches.push({ sprite, index });
      this.group.add(sprite);
    });
  }

  tick(dt) {
    this.time += dt;
    const cam = this.stage.camera;
    const h = Math.max(1, this.stage.canvas.clientHeight), w = Math.max(1, this.stage.canvas.clientWidth);
    const px = (2 * Math.tan((cam.fov * DEG) / 2)) / h;   // sizeAttenuation=false sprites: scale for one pixel
    for (const [id, d] of this.dots) {
      const world = this.anchorWorld(d.hotspot);
      const toCam = cam.position.clone().sub(world);
      const dist = toCam.length();
      world.addScaledVector(toCam.normalize(), Math.min(0.3, dist * 0.08));     // lift toward the eye so the car never clips the dot
      const visible = this.visible && (!this.open || id === this.open);
      const grow = id === this.hover ? 1.35 : id === this.selected ? 1.2 : 1;
      const base = 30 * px * grow * (id === this.open ? 0.75 : 1);
      d.sprite.position.copy(world);
      d.sprite.scale.setScalar(base);
      d.sprite.visible = visible;
      d.sprite.material.color.set(id === this.selected && this.design ? '#ffb238' : '#ffffff');
      const t = (this.time * 0.7 + d.phase) % 1;
      d.ring.position.copy(world);
      d.ring.scale.setScalar(base * (0.9 + t * 0.9));
      d.ring.material.opacity = (1 - t) * 0.7;
      d.ring.visible = visible && id !== this.open;
    }
    // swatch strip: a centred row near the bottom of the view, one unit in front of the camera
    const n = this.swatches.length;
    if (!n) return;
    const d = this.dots.get(this.open);
    const choice = d ? d.hotspot.choice : -1;
    const size = 46 * px, gap = 62;
    this.swatches.forEach((s, i) => {
      const xPx = (i - (n - 1) / 2) * gap;                      // pixels from centre
      const ndc = new THREE.Vector3((xPx / w) * 2, -1 + (64 / h) * 2, 0.5);
      const p = ndc.unproject(cam);
      const dir = p.sub(cam.position).normalize();
      s.sprite.position.copy(cam.position).addScaledVector(dir, 1);
      const sel = s.index === choice;
      const hov = this.hoverSwatch === s.index;
      s.sprite.scale.setScalar(size * (sel ? 1.18 : hov ? 1.1 : 0.94));
      s.sprite.material.opacity = sel || hov ? 1 : 0.88;
      s.sprite.visible = this.visible;
    });
  }

  // Raycast the dots and swatches; returns { hotspotId } or { swatch } or null.
  pick(clientX, clientY) {
    const rect = this.stage.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.stage.camera);
    const sw = this.swatches.map((s) => s.sprite).filter((s) => s.visible);
    const hitS = sw.length ? ray.intersectObjects(sw, false)[0] : null;
    if (hitS) return { swatch: hitS.object.userData.swatch };
    const dots = [...this.dots.values()].map((d) => d.sprite).filter((s) => s.visible);
    const hitD = dots.length ? ray.intersectObjects(dots, false)[0] : null;
    return hitD ? { hotspotId: hitD.object.userData.hotspotId } : null;
  }
}
HotspotLayer.prototype.visible = true;
HotspotLayer.prototype.design = true;
