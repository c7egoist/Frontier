/* ============================================================
   FRONTIER · VIEWPORT — live 3D world rendered from the
   hierarchy (three.js). The outliner owns state; this module
   owns pixels. Talk via window.__frontier* hooks.
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const container = document.getElementById("viewport");
const vignette = document.getElementById("vignette");
const fallback = document.getElementById("vpFallback");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  fallback.hidden = false;
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
camera.position.set(11, 7, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 3;
controls.maxDistance = 90;

/* ---------- sky dome ---------- */

const skyUni = {
  top: { value: new THREE.Color("#04060d") },
  hor: { value: new THREE.Color("#0a0e1a") },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(260, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUni,
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 hor; varying vec3 vP;" +
      "void main(){ float h = normalize(vP).y;" +
      " vec3 c = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55));" +
      " c = mix(c, hor * 0.35, clamp(-h * 3.0, 0.0, 1.0));" +
      " gl_FragColor = vec4(c, 1.0); }",
  })
);
scene.add(sky);

/* ---------- sprites / celestial ---------- */

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();

function makeDisc(r, color, glowScale) {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(r, 40),
    new THREE.MeshBasicMaterial({ color, fog: false, transparent: true })
  );
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  glow.scale.setScalar(glowScale);
  grp.add(disc, glow);
  grp.userData.disc = disc;
  grp.userData.glow = glow;
  return grp;
}

const sunG = makeDisc(5, "#fff3d6", 26);
const moonG = makeDisc(3.2, "#e8ecf4", 15);
scene.add(sunG, moonG);

/* stars */
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 600; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(230);
    if (v.y < 8) v.y = Math.abs(v.y) + 8;
    pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
scene.add(new THREE.Points(starGeo, starMat));

/* ---------- lights ---------- */

const sunLight = new THREE.DirectionalLight(0xffffff, 3);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -18;
sunLight.shadow.camera.right = 18;
sunLight.shadow.camera.top = 18;
sunLight.shadow.camera.bottom = -18;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 160;
sunLight.shadow.bias = -0.0004;
scene.add(sunLight, sunLight.target);

const moonLight = new THREE.DirectionalLight(0x8fb4ff, 0);
scene.add(moonLight, moonLight.target);

const hemi = new THREE.HemisphereLight(0xbdd0ff, 0x14161c, 0.4);
scene.add(hemi);
scene.add(new THREE.AmbientLight(0xffffff, 0.12));

/* ---------- world ---------- */

const world = new THREE.Group();
scene.add(world);
let anim = []; // { obj, kind, speed, base, vol }
let selHelper = null;
let lastGlobals = {};
let lastTime = 10;

function disposeDeep(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

function std(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.05 }, opts || {}));
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const tmpColor = new THREE.Color();

function buildEntity(n) {
  const P = n.props || {};
  const g = new THREE.Group();
  const name = (n.text || "").toLowerCase();
  const px = P.x || 0, py = P.y !== undefined ? P.y : 0.6, pz = P.z || 0;
  const s = P.scale || 1;

  switch (n.type) {
    case "mesh": {
      if (name.includes("ground")) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), std(tmpColor.set(P.color || "#9aa3b5").multiplyScalar(0.32).getHex()));
        m.rotation.x = -Math.PI / 2;
        m.receiveShadow = true;
        g.add(m);
        g.position.set(0, 0, 0);
        return g;
      }
      if (name.includes("grid")) {
        g.add(new THREE.GridHelper(24, 24, 0xd4f542, 0x3a3f4d));
        g.position.set(0, 0.02, 0);
        return g;
      }
      if (name.includes("dome") || name.includes("sky")) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: P.color || "#3a4356", wireframe: true, transparent: true, opacity: 0.35 })
        );
        g.add(m);
        return g;
      }
      const isCapsule = name.includes("capsule");
      const isCoin = name.includes("coin") || name.includes("pickup");
      let geo;
      if (isCapsule) geo = new THREE.CapsuleGeometry(0.5, 1, 6, 14);
      else if (isCoin) geo = new THREE.TorusGeometry(0.55, 0.22, 12, 24);
      else geo = new THREE.BoxGeometry(1, 1, 1);
      const col = isCoin ? "#e8b93e" : (P.color || "#9aa3b5");
      const m = shadowed(new THREE.Mesh(geo, std(col, { metalness: isCoin ? 0.7 : 0.05, roughness: isCoin ? 0.3 : 0.85 })));
      m.position.y = isCapsule ? 1 : 0.5;
      g.add(m);
      // group origin sits at the object's base so Y moves it off the ground
      g.position.set(px, isCapsule ? py - 0.6 : py - 0.5 * s, pz);
      g.scale.setScalar(s);
      return g;
    }
    case "physics": {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.4, 1.4, 1.4)),
        new THREE.LineBasicMaterial({ color: P.color || "#d4f542" })
      );
      edges.position.y = 0.7;
      g.add(edges);
      break;
    }
    case "particles": {
      const count = 90;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(0.4 + Math.random() * 1.1);
        pos.set([v.x, v.y, v.z], i * 3);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: P.color || "#d4f542", size: 0.09, transparent: true, opacity: 0.95 }));
      pts.position.y = 1;
      g.add(pts);
      anim.push({ obj: pts, kind: "spin", speed: P.speed || 1 });
      break;
    }
    case "audio": {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), std("#e8ecf4", { emissive: "#5a6272", emissiveIntensity: 0.6 }));
      m.position.y = 1;
      g.add(m);
      anim.push({ obj: m, kind: "pulse", speed: 1, base: 1, vol: P.volume !== undefined ? P.volume : 0.8 });
      break;
    }
    case "camera": {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 1, 4, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xd4f542, wireframe: true })
      );
      cone.rotation.x = Math.PI;
      cone.position.y = 1;
      const fov = (P.fov || 50) / 50;
      cone.scale.set(fov, 1, fov);
      g.add(cone);
      const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), std("#2a2f3a")));
      body.position.y = 1.55;
      g.add(body);
      break;
    }
    case "light": {
      const c = P.color || "#ffd9a0";
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: c }));
      bulb.position.y = 1;
      const pt = new THREE.PointLight(c, (P.intensity !== undefined ? P.intensity : 1) * 30, 26, 2);
      pt.position.y = 1;
      g.add(bulb, pt);
      break;
    }
    case "spot": {
      const c = P.color || "#fff3d6";
      const head = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 12), std("#2a2f3a")));
      head.position.y = 1;
      const sp = new THREE.SpotLight(c, (P.intensity !== undefined ? P.intensity : 1) * 60, 34, 0.5, 0.45, 1.6);
      sp.position.y = 1;
      sp.target.position.set(0, 0, 0);
      g.add(head, sp, sp.target);
      break;
    }
    default:
      return null; // folder / sun / moon / sky / skylight / fog / script / post have no body
  }

  // children sit ~1 unit up, so Y reads as the object's center height
  const yOff = n.type === "physics" ? 0.7 : 1;
  g.position.set(px, py - yOff, pz);
  if (P.scale && (n.type === "physics" || n.type === "particles")) g.scale.setScalar(P.scale);
  return g;
}

function firstVisible(nodes, type) {
  return nodes.find((n) => n.type === type && n.visible !== false);
}

function buildWorld(nodes, selectedId, time) {
  while (world.children.length) {
    const c = world.children.pop();
    world.remove(c);
    disposeDeep(c);
  }
  if (selHelper) {
    scene.remove(selHelper);
    selHelper.geometry.dispose();
    selHelper.material.dispose();
    selHelper = null;
  }
  anim = [];

  const sunE = firstVisible(nodes, "sun");
  const moonE = firstVisible(nodes, "moon");
  const skyE = firstVisible(nodes, "sky");
  const skylightE = firstVisible(nodes, "skylight");
  const fogE = firstVisible(nodes, "fog");
  const postE = firstVisible(nodes, "post");
  lastGlobals = { sunE, moonE, skyE, skylightE, fogE };

  vignette.style.opacity = postE ? (postE.props && postE.props.intensity !== undefined ? postE.props.intensity : 0.35) : 0;

  if (fogE) {
    const P = fogE.props || {};
    scene.fog = new THREE.FogExp2(P.color || "#8b93a7", P.density !== undefined ? P.density : 0.008);
  } else {
    scene.fog = null;
  }

  sky.visible = !!skyE;
  sunG.visible = !!sunE;
  moonG.visible = !!moonE;

  let selObj = null;
  nodes.forEach((n) => {
    if (n.visible === false) return;
    const o = buildEntity(n);
    if (!o) return;
    o.userData.entityId = n.id;
    world.add(o);
    if (n.id === selectedId) selObj = o;
  });

  updateEnvironment(time !== undefined ? time : lastTime);

  if (selObj) {
    selHelper = new THREE.BoxHelper(selObj, 0xd4f542);
    scene.add(selHelper);
  }
}

/* ---------- environment / time of day ---------- */

const C = {
  dayTop: new THREE.Color("#2f66d0"), nightTop: new THREE.Color("#04060d"),
  dayHor: new THREE.Color("#b9c8e4"), nightHor: new THREE.Color("#0a0e1a"),
  dusk: new THREE.Color("#ff8a4c"),
  sunHigh: new THREE.Color("#fff3d6"), sunLow: new THREE.Color("#ff7a2f"),
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function updateEnvironment(t) {
  lastTime = t;
  const ang = ((t - 6) / 12) * Math.PI; // 6h rise → 18h set
  const elev = Math.sin(ang);
  const day = clamp01((elev + 0.08) / 0.3);
  const night = 1 - day;

  const sx = -Math.cos(ang) * 150, sy = elev * 150, sz = 40;
  sunG.position.set(sx, sy, sz);
  sunG.lookAt(0, 0, 0);
  sunLight.position.set(sx / 5, Math.max(sy / 5, 2), sz / 5);

  const mang = ang + Math.PI;
  const mel = Math.sin(mang);
  const mx = -Math.cos(mang) * 150, my = mel * 150, mz = -30;
  moonG.position.set(mx, my, mz);
  moonG.lookAt(0, 0, 0);
  moonLight.position.set(mx / 5, Math.max(my / 5, 2), mz / 5);

  const G = lastGlobals;
  const sunI = G.sunE && G.sunE.props && G.sunE.props.intensity !== undefined ? G.sunE.props.intensity : 3;
  const moonI = G.moonE && G.moonE.props && G.moonE.props.intensity !== undefined ? G.moonE.props.intensity : 0.6;
  sunLight.intensity = day * sunI;
  sunLight.color.copy(C.sunLow).lerp(C.sunHigh, clamp01(elev * 2.2));
  moonLight.intensity = night * moonI;
  sunG.userData.disc.material.color.copy(sunLight.color);
  sunG.userData.glow.material.color.copy(sunLight.color);
  sunG.visible = !!G.sunE && elev > -0.08;
  moonG.visible = !!G.moonE && mel > -0.06;

  skyUni.top.value.copy(C.nightTop).lerp(C.dayTop, day);
  skyUni.hor.value.copy(C.nightHor).lerp(C.dayHor, day);
  const dusk = clamp01(1 - Math.abs(elev) * 3.2) * (elev > -0.12 ? 1 : 0);
  skyUni.hor.value.lerp(C.dusk, dusk * 0.55);
  starMat.opacity = night * 0.9;

  let hemiBase = 0.18 + 0.5 * day;
  if (G.skylightE) {
    const si = G.skylightE.props && G.skylightE.props.intensity !== undefined ? G.skylightE.props.intensity : 0.5;
    hemiBase *= Math.max(0.05, si * 2);
  }
  hemi.intensity = hemiBase;
}

/* ---------- loop ---------- */

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  for (const a of anim) {
    if (a.kind === "spin") a.obj.rotation.y += dt * a.speed;
    else if (a.kind === "pulse") {
      const s = a.base * (1 + 0.18 * Math.sin(t * 3) * (a.vol || 0));
      a.obj.scale.setScalar(Math.max(0.6, s));
    }
  }
  controls.update();
  renderer.render(scene, camera);
}
loop();

/* ---------- resize ---------- */

function resize() {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
window.addEventListener("resize", resize);
resize();

/* ---------- picking ---------- */

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
  downAt = null;
  if (dx * dx + dy * dy > 25) return; // was a drag
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(world.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.entityId) o = o.parent;
    if (o && o.userData.entityId) {
      if (window.__frontierSelect) window.__frontierSelect(o.userData.entityId);
      return;
    }
  }
});

/* ---------- bridge ---------- */

window.__frontierSync = (snap) => {
  if (!snap || !Array.isArray(snap.nodes)) return;
  buildWorld(snap.nodes, snap.selectedId, snap.timeOfDay);
};
window.__frontierTime = (t) => updateEnvironment(t);
window.__frontierReady = true;
fallback.hidden = true;
if (window.__frontierRequestSync) window.__frontierRequestSync();
