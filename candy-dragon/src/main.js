import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildDragon } from './dragon.js';
import { makeCandyEnvironment, makeBackdrop } from './env.js';
import './style.css';

/* ================================================================== *
 *  RENDERER
 * ================================================================== */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color('#160718'), 0.028);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(6.2, 3.4, 12.4);

/* ---- environment ---- */
const envMap = makeCandyEnvironment(renderer);
scene.environment = envMap;
scene.environmentIntensity = 1.0;
scene.add(makeBackdrop());

/* ---- lights ---- */
const key = new THREE.DirectionalLight(new THREE.Color('#fff0f6'), 3.1);
key.position.set(-6.5, 9.5, 7.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.camera.left = -9;
key.shadow.camera.right = 9;
key.shadow.camera.top = 11;
key.shadow.camera.bottom = -6;
key.shadow.bias = -0.0012;
key.shadow.normalBias = 0.028;
key.shadow.radius = 3;
scene.add(key);

const rim = new THREE.DirectionalLight(new THREE.Color('#7ff5e0'), 2.0);
rim.position.set(7.5, 5.0, -8.0);
scene.add(rim);

const warm = new THREE.DirectionalLight(new THREE.Color('#ff9e5e'), 1.15);
warm.position.set(-2.0, 1.2, 9.0);
scene.add(warm);

const hemi = new THREE.HemisphereLight(new THREE.Color('#c9a0ff'), new THREE.Color('#4a0f2e'), 0.85);
scene.add(hemi);

/* ---- the sculpture ---- */
const dragon = buildDragon();
scene.add(dragon.stage);

/* ---- a little floor reflection haze ---- */
{
  const glowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#7a1b4e'),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glowPlane.rotation.x = -Math.PI / 2;
  glowPlane.position.y = -2.42;
  glowPlane.scale.set(1, 1, 1);
  scene.add(glowPlane);
}

/* ================================================================== *
 *  CAMERA CONTROLS
 * ================================================================== */
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.55, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 7.4;
controls.maxDistance = 19;
controls.minPolarAngle = 0.42;
controls.maxPolarAngle = Math.PI * 0.545;
controls.rotateSpeed = 0.72;
controls.zoomSpeed = 0.75;
controls.autoRotateSpeed = 0.55;
controls.update();

/* ================================================================== *
 *  POST — bloom makes sugar glow
 * ================================================================== */
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.62,   // strength
  0.72,   // radius
  0.78    // threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ================================================================== *
 *  INTERACTION
 * ================================================================== */
const hint = document.getElementById('hint');
const dock = document.getElementById('dock');
const statsEl = document.getElementById('stats');
const fpsEl = document.getElementById('fps');

let interacted = false;
const markInteracted = () => {
  intro.active = false;
  if (interacted) return;
  interacted = true;
  hint.classList.add('gone');
  statsEl.classList.add('show');
  setTimeout(() => statsEl.classList.remove('show'), 4200);
};
canvas.addEventListener('pointerdown', markInteracted, { once: true });

/* tap the sculpture for a sugar sparkle */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = 0;
let downPos = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  downAt = performance.now();
  downPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  if (performance.now() - downAt > 400 || moved > 8) return;
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(dragon.stage, true);
  if (hits.length) {
    const pt = hits[0].point;
    burstAt(pt, 70);
    sparkle = 1;
  }
});
controls.addEventListener('start', markInteracted);

/* posable behaviour */
const pose = {
  roar: 0,          // 0..1
  roarTarget: 0,
  bloom: 0,
  bloomTarget: 0,
  orbit: false,
};

function triggerRoar() {
  pose.roarTarget = 1;
  setTimeout(() => { pose.roarTarget = 0; }, 1500);
  pose.bloomTarget = 1;
  setTimeout(() => { pose.bloomTarget = 0; }, 2600);
  burstEmbers(150);
}

document.querySelectorAll('.dock__btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    markInteracted();
    if (act === 'roar') {
      btn.classList.add('is-busy');
      triggerRoar();
      setTimeout(() => btn.classList.remove('is-busy'), 1600);
    }
    if (act === 'orbit') {
      pose.orbit = !pose.orbit;
      controls.autoRotate = pose.orbit;
      btn.classList.toggle('is-on', pose.orbit);
    }
    if (act === 'majesty') {
      pose.majesty = !pose.majesty;
      btn.classList.toggle('is-on', pose.majesty);
      // a slow, ceremonial camera settle
      if (pose.majesty) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.32;
        bloom.strength = 0.78;
      } else {
        controls.autoRotate = pose.orbit;
        controls.autoRotateSpeed = 0.55;
        bloom.strength = 0.62;
      }
    }
    if (act === 'bloom') {
      pose.bloomTarget = pose.bloom > 0.5 ? 0 : 1;
      btn.classList.toggle('is-on', pose.bloomTarget > 0.5);
      if (pose.bloomTarget) burstEmbers(240);
    }
  });
});

/* ================================================================== *
 *  EMBERS — candy sparks that fly out on a roar
 * ================================================================== */
const EMBER_MAX = 700;
const emberGeo = new THREE.BufferGeometry();
const emberPos = new Float32Array(EMBER_MAX * 3);
const emberCol = new Float32Array(EMBER_MAX * 3);
const emberVel = new Float32Array(EMBER_MAX * 3);
const emberLife = new Float32Array(EMBER_MAX);
const emberSize = new Float32Array(EMBER_MAX);
for (let i = 0; i < EMBER_MAX; i++) {
  emberPos[i * 3 + 1] = -999;
  emberSize[i] = 0;
}
emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
emberGeo.setAttribute('color', new THREE.BufferAttribute(emberCol, 3));

const emberMat = new THREE.PointsMaterial({
  size: 0.16,
  map: dragon.materials.spark.map,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  sizeAttenuation: true,
  opacity: 0.95,
});
const embers = new THREE.Points(emberGeo, emberMat);
embers.frustumCulled = false;
scene.add(embers);

let emberCursor = 0;
const MOUTH = new THREE.Vector3(1.55, 3.35, 0);

let sparkle = 0;
function burstAt(origin, n = 100) {
  const c1 = new THREE.Color('#ffb457');
  const c2 = new THREE.Color('#ff5c9e');
  const c3 = new THREE.Color('#ffe9b0');
  for (let k = 0; k < n; k++) {
    const i = emberCursor = (emberCursor + 1) % EMBER_MAX;
    const a = Math.random() * Math.PI * 2;
    const spread = Math.random() * 0.9;
    const speed = 1.4 + Math.random() * 4.4;
    const dir = new THREE.Vector3(
      Math.cos(a) * spread * 0.8,
      Math.sin(a) * spread,
      (Math.random() - 0.5) * 1.1
    ).normalize();
    const o = origin.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.22,
      (Math.random() - 0.5) * 0.22,
      (Math.random() - 0.5) * 0.22
    ));
    emberPos[i * 3] = o.x;
    emberPos[i * 3 + 1] = o.y;
    emberPos[i * 3 + 2] = o.z;
    const push = origin.x > 0.8 ? 1.6 : 0.25;
    emberVel[i * 3] = dir.x * speed + push;
    emberVel[i * 3 + 1] = dir.y * speed + 0.9;
    emberVel[i * 3 + 2] = dir.z * speed;
    emberLife[i] = 1.0 + Math.random() * 0.9;
    const c = Math.random() < 0.4 ? c1 : Math.random() < 0.7 ? c2 : c3;
    emberCol[i * 3] = c.r;
    emberCol[i * 3 + 1] = c.g;
    emberCol[i * 3 + 2] = c.b;
  }
  emberGeo.attributes.position.needsUpdate = true;
  emberGeo.attributes.color.needsUpdate = true;
}

function burstEmbers(n = 120) {
  burstAt(MOUTH, n);
}

function updateEmbers(dt) {
  let dirty = false;
  for (let i = 0; i < EMBER_MAX; i++) {
    if (emberLife[i] <= 0) continue;
    dirty = true;
    emberLife[i] -= dt * 0.72;
    emberVel[i * 3 + 1] -= dt * 0.9;
    emberPos[i * 3] += emberVel[i * 3] * dt;
    emberPos[i * 3 + 1] += emberVel[i * 3 + 1] * dt;
    emberPos[i * 3 + 2] += emberVel[i * 3 + 2] * dt;
    if (emberLife[i] <= 0) emberPos[i * 3 + 1] = -999;
  }
  if (dirty) emberGeo.attributes.position.needsUpdate = true;
}

/* ================================================================== *
 *  LOOP
 * ================================================================== */
const clock = new THREE.Clock();
const intro = { active: true, t: 0 };
const INTRO_START = new THREE.Vector3(11.5, 5.4, 16.5);
const INTRO_END = new THREE.Vector3(6.2, 3.4, 12.4);
camera.position.copy(INTRO_START);
let frames = 0;
let fpsTime = 0;
let quality = 2;
const loader = document.getElementById('loader');
let firstFrame = true;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
}
window.addEventListener('resize', resize);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  // ease behaviour
  pose.roar += (pose.roarTarget - pose.roar) * Math.min(1, dt * 6);
  pose.bloom += (pose.bloomTarget - pose.bloom) * Math.min(1, dt * 2.4);
  sparkle = Math.max(0, sparkle - dt * 1.6);
  bloom.strength = THREE.MathUtils.lerp(0.62, 1.35, pose.roar)
    + pose.bloom * 0.35 + sparkle * 0.30;

  dragon.update(dt);
  if (dragon.setPose) dragon.setPose(pose);

  updateEmbers(dt);
  controls.update();

  const t = dragon.state.t;

  // cinematic intro swoop
  if (intro.active) {
    intro.t = Math.min(1, intro.t + dt / 2.6);
    const k = 1 - Math.pow(1 - intro.t, 3.2);
    camera.position.lerpVectors(INTRO_START, INTRO_END, k);
    controls.target.set(0, 0.55 - 0.18 * (1 - k), 0);
    if (intro.t >= 1) intro.active = false;
    controls.update();
  }

  // gentle breathing camera drift
  camera.position.y += Math.sin(t * 0.4) * 0.0016;

  if (pose.roar > 0.02) {
    const sh = pose.roar * 0.02;
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.y += (Math.random() - 0.5) * sh;
  }

  composer.render();

  if (firstFrame) {
    firstFrame = false;
    setTimeout(() => loader.classList.add('gone'), 260);
  }

  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    const fps = Math.round(frames / fpsTime);
    fpsEl.textContent = fps;
    // adaptive resolution: keep it smooth on modest GPUs
    if (fps < 34 && quality > 1) {
      quality -= 0.15;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Math.max(1, quality)));
      composer.setPixelRatio(Math.min(devicePixelRatio || 1, Math.max(0.85, quality * 0.9)));
      resize();
    }
    frames = 0;
    fpsTime = 0;
  }
}

/* reveal + first render */
resize();
dragon.state.reveal = 0;
tick();

/* keyboard shortcuts */
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') triggerRoar();
  if (e.key === ' ') {
    e.preventDefault();
    pose.orbit = !pose.orbit;
    controls.autoRotate = pose.orbit;
    document.querySelector('[data-act="orbit"]').classList.toggle('is-on', pose.orbit);
  }
});

/* pause when hidden */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clock.stop();
  else clock.start();
});
