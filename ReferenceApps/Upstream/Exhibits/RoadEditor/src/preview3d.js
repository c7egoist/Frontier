/* ════════════════════════════════════════════════════════════════════
   preview3d.js — Three.js road + terrain preview. Y-up metres, same lighting
   idiom as Terrain Lab. Includes a drive-through camera.
   ════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildNetworkMesh} from './geometry.js';
import {sampleAtStation} from './topology.js';

const SKY = '#16191f';

export function createPreview(container, store, env) {
  const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(SKY, 0.0011);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 1200;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(0xe5ebef, 0x3a3a32, 1.05));
  const sun = new THREE.DirectionalLight(0xfff2df, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.1;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xd0dbe3, 0.55);
  fill.position.set(120, 60, -140);
  scene.add(fill);

  let roadsGroup = new THREE.Group();
  let terrainMesh = null;
  let grid = null;
  let juncGroup = new THREE.Group();
  scene.add(roadsGroup, juncGroup);

  let terrainRev = -1;
  let renderFrames = 4;
  const invalidate = () => { renderFrames = 6; };
  controls.addEventListener('change', invalidate);

  let drive = null; // {roadId, s, speed, playing, dir}
  const clock = new THREE.Clock();

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    g.clear();
  }

  function terrainSampler() {
    const t = env.getTerrain();
    return t ? t.sample : null;
  }

  function rebuildRoads() {
    disposeGroup(roadsGroup);
    disposeGroup(juncGroup);
    const p = store.project;
    const sel = store.selection;
    const terrain = terrainSampler();
    let built;
    try {
      built = buildNetworkMesh(p, env.getSampleMap(), env.getTopology(), terrain);
    } catch (e) {
      console.error('mesh build failed', e);
      return;
    }
    const matFor = (roadId) => {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.93, metalness: 0.0, side: THREE.DoubleSide
      });
      if (roadId && sel.roadId === roadId) {
        mat.emissive = new THREE.Color('#4a90e2');
        mat.emissiveIntensity = 0.22;
      }
      if (store.ui.wireframe) mat.wireframe = true;
      return mat;
    };
    const mats = new Map();
    const getMat = (roadId) => {
      const k = roadId || '';
      if (!mats.has(k)) mats.set(k, matFor(roadId));
      return mats.get(k);
    };
    for (const part of built.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      g.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(part.indices, 1));
      const mesh = new THREE.Mesh(g, getMat(part.roadId));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = part.junction ? `junction__${part.name}` : `${part.roadId || '?'}__${part.name}`;
      roadsGroup.add(mesh);
    }
    // Junction diamonds.
    const jmat = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.5, emissive: 0x7a4a00, emissiveIntensity: 0.4});
    for (const j of p.junctions || []) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), jmat);
      m.position.set(j.x, j.y + 1.2, j.z);
      m.castShadow = true;
      juncGroup.add(m);
    }
    // Overpass clearance poles (upper deck ↔ lower road at the crossing).
    for (const o of env.getTopology?.()?.overpasses || []) {
      const sU = env.getSamples(o.upper), sL = env.getSamples(o.lower);
      if (!sU || !sL) continue;
      const a = sampleAtStation(sU.samples, o.sUpper), b = sampleAtStation(sL.samples, o.sLower);
      if (!a || !b) continue;
      const col = o.gap < 4.5 ? 0xef4444 : o.gap < 6 ? 0xf59e0b : 0x34d399;
      const mat = new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.9});
      const y0 = Math.min(a.y, b.y) + 0.15, y1 = Math.max(a.y, b.y) - 0.15;
      if (y1 - y0 > 0.4) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, y1 - y0, 6), mat);
        pole.position.set(o.x, (y0 + y1) / 2, o.z);
        juncGroup.add(pole);
      }
      for (const yy of [y0, y1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 6, 18), mat);
        ring.position.set(o.x, yy, o.z);
        ring.rotation.x = Math.PI / 2;
        juncGroup.add(ring);
      }
    }
    fitSun();
    invalidate();
  }

  function fitSun() {
    const box = new THREE.Box3().setFromObject(roadsGroup);
    if (box.isEmpty()) {
      const t = env.getTerrain();
      const R = t ? Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxZ - t.bounds.minZ) / 2 : 200;
      box.set(new THREE.Vector3(-R, -5, -R), new THREE.Vector3(R, 30, R));
    }
    const c = box.getCenter(new THREE.Vector3());
    const R = Math.max(60, box.getSize(new THREE.Vector3()).length() / 2);
    sun.position.set(c.x - R * 0.9, c.y + R * 1.4, c.z + R * 0.7);
    sun.target.position.copy(c);
    Object.assign(sun.shadow.camera, {left: -R, right: R, top: R, bottom: -R, far: R * 6, near: 1});
    sun.shadow.camera.updateProjectionMatrix();
  }

  function rebuildTerrain() {
    const t = env.getTerrain();
    if (t && t.rev === terrainRev && terrainMesh) return;
    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      terrainMesh.material.dispose();
      terrainMesh = null;
    }
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); grid = null; }
    terrainRev = t ? t.rev : -1;

    if (t) {
      const w = t.bounds.maxX - t.bounds.minX, d = t.bounds.maxZ - t.bounds.minZ;
      const SEG = 150;
      const g = new THREE.PlaneGeometry(w, d, SEG, SEG);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const span = Math.max(1e-6, t.maxY - t.minY);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + (t.bounds.minX + t.bounds.maxX) / 2;
        const z = pos.getZ(i) + (t.bounds.minZ + t.bounds.maxZ) / 2;
        const h = t.sample(x, z) ?? t.minY;
        pos.setY(i, h - 0.06);
        pos.setX(i, x); pos.setZ(i, z);
        const f = (h - t.minY) / span;
        colors[i * 3] = 0.10 + f * 0.30;
        colors[i * 3 + 1] = 0.13 + f * 0.24;
        colors[i * 3 + 2] = 0.09 + f * 0.13;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      terrainMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1}));
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);
      const gs = Math.max(w, d);
      grid = new THREE.GridHelper(gs, Math.round(gs / 10), 0x8a8a8e, 0x3a3a3e);
      grid.position.set((t.bounds.minX + t.bounds.maxX) / 2, t.minY + 0.05, (t.bounds.minZ + t.bounds.maxZ) / 2);
    } else {
      terrainMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1600, 1600),
        new THREE.MeshStandardMaterial({color: 0x1b211b, roughness: 1})
      );
      terrainMesh.rotation.x = -Math.PI / 2;
      terrainMesh.position.y = -0.08;
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);
      grid = new THREE.GridHelper(1200, 120, 0x46523b, 0x333a2e);
      grid.position.y = -0.04;
    }
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    scene.add(grid);
    invalidate();
  }

  function resetCamera(top = false) {
    stopDrive();
    const box = new THREE.Box3().setFromObject(roadsGroup);
    const t = env.getTerrain();
    let center, radius;
    if (!box.isEmpty()) {
      center = box.getCenter(new THREE.Vector3());
      radius = Math.max(20, box.getSize(new THREE.Vector3()).length() / 2);
    } else if (t) {
      center = new THREE.Vector3(
        (t.bounds.minX + t.bounds.maxX) / 2, (t.minY + t.maxY) / 2,
        (t.bounds.minZ + t.bounds.maxZ) / 2);
      radius = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxZ - t.bounds.minZ) / 2;
    } else {
      center = new THREE.Vector3(0, 0, 0);
      radius = 120;
    }
    controls.target.copy(center);
    const dir = top
      ? new THREE.Vector3(0.001, 1, 0.001)
      : new THREE.Vector3(1.1, 0.75, 1.35).normalize();
    camera.position.copy(center).addScaledVector(dir, radius * (top ? 2.1 : 1.9));
    camera.near = Math.max(0.05, radius / 500);
    camera.far = Math.max(2000, radius * 12);
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }

  function sampleAt(roadId, s) {
    const smp = env.getSamples(roadId);
    if (!smp || !smp.count) return null;
    const S = smp.samples;
    let ss = s;
    if (smp.closed) ss = ((s % smp.length) + smp.length) % smp.length;
    else ss = Math.min(smp.length - 0.001, Math.max(0, s));
    const ds = smp.length / (smp.closed ? S.length : S.length - 1);
    const f = ss / ds;
    const i0 = Math.floor(f) % S.length, i1 = (i0 + 1) % S.length;
    const fr = f - Math.floor(f);
    const a = S[i0], b = smp.closed || i1 < S.length ? S[i1] : a;
    return {
      x: a.x + (b.x - a.x) * fr, y: a.y + (b.y - a.y) * fr, z: a.z + (b.z - a.z) * fr,
      tx: a.tx, tz: a.tz, length: smp.length, closed: smp.closed
    };
  }

  function startDrive(roadId, speed = 16) {
    const smp = env.getSamples(roadId);
    if (!smp || !smp.count) return false;
    drive = {roadId, s: 0, speed, playing: true};
    controls.enabled = false;
    env.onDriveState?.(true);
    return true;
  }

  function stopDrive(silent = false) {
    if (!drive) return;
    drive = null;
    controls.enabled = true;
    if (!silent) env.onDriveState?.(false);
    invalidate();
  }

  function stepDrive(dt) {
    if (!drive?.playing) return;
    const smp = env.getSamples(drive.roadId);
    if (!smp || !smp.count) { stopDrive(); return; }
    drive.s += drive.speed * dt;
    if (!smp.closed && drive.s >= smp.length) {
      stopDrive();
      env.toast('End of road — drive finished');
      return;
    }
    const p = sampleAt(drive.roadId, drive.s);
    const ahead = sampleAt(drive.roadId, drive.s + 9);
    if (!p || !ahead) return;
    camera.position.set(p.x, p.y + 2.5, p.z);
    camera.lookAt(ahead.x, ahead.y + 1.1, ahead.z);
  }

  function refresh() {
    rebuildTerrain();
    rebuildRoads();
  }

  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(50, r.width), h = Math.max(50, r.height);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    if (drive) {
      stepDrive(dt);
      renderer.render(scene, camera);
      return;
    }
    controls.update();
    controls.autoRotate = !!store.ui.autoRotate;
    controls.autoRotateSpeed = 0.7;
    if (renderFrames <= 0 && !controls.autoRotate) return;
    renderFrames--;
    renderer.render(scene, camera);
  });

  store.subscribe((tag) => {
    if (tag === 'selection') { rebuildRoads(); }
    if (tag === 'ui') {
      roadsGroup.traverse((o) => {
        if (o.material) o.material.wireframe = !!store.ui.wireframe;
      });
      invalidate();
    }
  });

  new ResizeObserver(resize).observe(container);

  return {
    refresh, resize, resetCamera,
    screenshot(name) {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 8000);
      }, 'image/png');
    },
    drive: startDrive,
    stopDrive,
    setDriveSpeed(v) { if (drive) drive.speed = v; },
    toggleDrivePlay() {
      if (drive) { drive.playing = !drive.playing; return drive.playing; }
      return false;
    },
    get driving() { return !!drive; },
    get drivePlaying() { return !!drive?.playing; },
    invalidate,
    dispose() {
      renderer.setAnimationLoop(null);
      disposeGroup(roadsGroup);
      disposeGroup(juncGroup);
      renderer.dispose();
      container.innerHTML = '';
    }
  };
}
