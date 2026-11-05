import * as THREE from 'three';
import { Rng, terrainHeight } from './util/noise.js';
import { Shared } from './gfx/shaderPatches.js';
import { createComposer } from './gfx/post.js';
import { SKY, buildSky, buildEnvironment } from './world/sky.js';
import { buildTerrain } from './world/terrain.js';
import { buildGrass } from './world/grass.js';
import { buildForest, buildFerns, buildWildflowers, buildPollen, buildShafts } from './world/environment.js';
import { buildDecoy } from './flora/decoys.js';
import { Predator, STATE } from './flora/predator.js';
import { Player } from './game/player.js';
import { Bait } from './game/bait.js';
import { AudioEngine } from './game/audio.js';
import { createUI } from './game/ui.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
const canvas = document.getElementById('view');

// ---------------------------------------------------------------------------
// Renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let basePR = LOW ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
if (params.get('pr')) basePR = parseFloat(params.get('pr'));
let curPR = basePR;
renderer.setPixelRatio(curPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.12, 900);
camera.position.set(0, 1.7, 0);
scene.fog = new THREE.FogExp2(SKY.horizon.clone().multiplyScalar(0.98), 0.0068);
scene.environment = buildEnvironment(renderer);
scene.environmentIntensity = 0.75;

const sky = buildSky();
scene.add(sky);

// lights: warm low sun, cool sky fill
const sun = new THREE.DirectionalLight(SKY.sunColor, 3.4);
sun.castShadow = true;
const SM = LOW ? 1024 : 2048;
sun.shadow.mapSize.set(SM, SM);
const SH = 75;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 420 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#b4cbc4', '#4d4b2a', 0.55);
scene.add(hemi);

// ---------------------------------------------------------------------------
// World
const ui = createUI({
  play: (mode) => start(mode),
  respawn: () => respawn(),
  reveal: (v) => { reveal = v; },
  observer: (v) => setMode(v ? 'observer' : 'play'),
  bloom: (v) => { if (post.bloomPass) post.bloomPass.enabled = v; },
  fog: (v) => { scene.fog.density = 0.0015 + v * 0.0106; },
  scout: () => addScout(),
  wake: () => lureNearest(),
});

let player, audio, post;
const predators = [], decoys = [], baits = [];
let reveal = false, mode = 'play', started = false, paused = true, deathTimer = 0;
let colliders = [];

const PLAN = [
  ['orchid', 13, -40, 12], ['lily', -26, -55, 9.5], ['orchid', -48, -10, 12.5], ['lily', 42, -14, 9.5],
  ['orchid', 32, 40, 11], ['lily', -30, 42, 9], ['orchid', 78, -62, 12], ['lily', -78, -48, 9.5],
  ['orchid', -60, 62, 11.5], ['lily', 70, 66, 9],
];

function buildWorld() {
  scene.add(buildTerrain());
  const grass = buildGrass({ count: LOW ? 50000 : 170000, size: 100 });
  scene.add(grass);
  scene.userData.grass = grass;

  const big = [];
  const rng = new Rng(2025);
  PLAN.forEach(([sp, x, z, H], i) => {
    const p = new Predator(sp, { x, z, H, seed: 100 + i * 7 });
    scene.add(p.group); predators.push(p); big.push({ x, z });
  });
  // decoys: tight patches around each predator (same species, same colours, same sizes) + scattered stands
  const place = (sp, x, z, H, seed) => {
    if (Math.hypot(x, z) < 15) return;
    if (big.some((b) => Math.hypot(b.x - x, b.z - z) < 7.5)) return;
    const d = buildDecoy(sp, { x, z, H, seed });
    scene.add(d); decoys.push(d); big.push({ x, z });
  };
  let seed = 500;
  for (const p of predators) {
    const n = LOW ? 4 : 8;
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, 6.28), r = rng.range(8, 22);
      const sp = rng.next() < 0.78 ? p.species : (p.species === 'orchid' ? 'lily' : 'orchid');
      const H = sp === 'orchid' ? rng.range(5.5, 13) : rng.range(4.5, 10.5);
      place(sp, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, H, seed++);
    }
  }
  const extra = LOW ? 14 : 44;
  for (let k = 0; k < extra; k++) {
    const a = rng.range(0, 6.28), r = Math.sqrt(rng.next()) * 125;
    const sp = rng.next() < 0.5 ? 'orchid' : 'lily';
    const H = sp === 'orchid' ? rng.range(3.5, 12) : rng.range(3, 10);
    place(sp, Math.cos(a) * r, Math.sin(a) * r, H, seed++);
  }
  const forest = buildForest({ count: LOW ? 30 : 70, avoid: big });
  scene.add(forest.group); colliders = forest.colliders;
  scene.add(buildFerns({ count: LOW ? 200 : 650, avoid: big }));
  scene.add(buildWildflowers({ perSpecies: LOW ? 90 : 300, avoid: big }));
  scene.add(buildPollen({ count: LOW ? 800 : 2200 }));
  scene.add(buildShafts({ count: LOW ? 8 : 16 }));
}

// ---------------------------------------------------------------------------
function setMode(m) {
  mode = m;
  if (!player) return;
  player.ghost = m === 'observer';
  ui.setMode(m);
  if (m === 'observer') {
    if (player.carriedBy) player.carriedBy = null;
    camera.position.set(-6, 6, 14);
    player.yaw = 0.3; player.pitch = -0.1;
    while (baits.length < 3) addScout();
  } else {
    baits.splice(0).forEach((b) => scene.remove(b.mesh));
    player.respawn();
  }
}

function addScout() {
  if (baits.length >= 6) return;
  const b = new Bait(scene, predators, 11 + baits.length * 5 + Math.floor(performance.now() % 97));
  baits.push(b);
}

function lureNearest() {
  if (!predators.length) return;
  if (!baits.length) addScout();
  let best = predators[0], bd = 1e9;
  for (const p of predators) { const d = p.baseWorld.distanceTo(camera.position); if (d < bd) { bd = d; best = p; } }
  const b = baits.find((x) => x.alive && !x.carriedBy) || baits[0];
  const a = Math.random() * 6.28, r = best.S0 * 0.62;
  b.position.set(best.x + Math.cos(a) * r, 0, best.z + Math.sin(a) * r);
  b.position.y = terrainHeight(b.position.x, b.position.z);
  b.alive = true; b.carriedBy = null; b.targetable = true; b.mesh.visible = true;
  b.dest.set(best.x, 0, best.z); b.home = best;
}

function respawn() {
  ui.showDeath(false);
  player.respawn();
  if (document.pointerLockElement !== canvas && mode === 'play') canvas.requestPointerLock?.();
}

function start(m) {
  if (!started) {
    started = true;
    audio.start();
  } else audio.start();
  ui.hideStart();
  paused = false;
  if (m !== mode || (m === 'observer' && !player.ghost)) setMode(m);
  if (m === 'play' && !params.has('nolock')) canvas.requestPointerLock?.();
  if (m === 'observer' && !params.has('nolock')) canvas.requestPointerLock?.();
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && started && player.alive) {
    // paused: show the card again
    document.getElementById('start').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    paused = true;
  }
});
canvas.addEventListener('click', () => { if (started && !paused && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });

addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'KeyT') { reveal = !reveal; ui.revealCheckbox.checked = reveal; }
  if (e.code === 'KeyO') setMode(mode === 'observer' ? 'play' : 'observer');
  if (e.code === 'KeyB') addScout();
  if (e.code === 'KeyN') lureNearest();
  if (e.code === 'KeyR' && !player.alive) respawn();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.composer.setPixelRatio(curPR); post.composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, ema = 1 / 60, adaptT = 0;
const sunV = new THREE.Vector3();
const prevState = new Map();
let totalTime = 0;

// slow cinematic orbit behind the title card
function attract() {
  const p = predators[0], t = totalTime * 0.045 + 0.6;
  const x = p.x + Math.cos(t) * 30, z = p.z + Math.sin(t) * 30;
  camera.position.set(x, terrainHeight(x, z) + 6.5 + Math.sin(t * 1.7) * 1.5, z);
  camera.lookAt(p.x, 7.5, p.z);
}

function frame(manualDt, noRender = false) {
  if (manualDt === undefined) requestAnimationFrame(frame);
  const dt = manualDt !== undefined ? manualDt : Math.min(clock.getDelta(), 0.1);
  if (!paused || !started || params.has('keepsim')) {
    totalTime += dt;
    Shared.uTime.value = totalTime;
    if (started) player.update(dt); else attract();
    baits.forEach((b) => b.update(dt));
    const targets = [player, ...baits];
    const ctx = { targets, audio, reveal };
    let danger = 0;
    for (const p of predators) {
      p.update(dt, totalTime, ctx);
      const prev = prevState.get(p);
      if (prev !== p.state) {
        prevState.set(p, p.state);
        if (p.target === player) {
          if (p.state === STATE.ALERT) ui.toast('Something is watching you', 'warn');
          if (p.state === STATE.HOLD) ui.toast('Grabbed!', 'warn');
          if (p.state === STATE.STUNNED) ui.toast('You broke free', 'good');
        }
      }
      const d = p.baseWorld.distanceTo(camera.position);
      if (p.state !== STATE.DORMANT) danger = Math.max(danger, 1 - Math.min(1, d / 50));
    }
    audio.setDanger(danger); audio.update();

    if (!player.alive && deathTimer === 0) { deathTimer = 0.001; }
    if (deathTimer > 0) { deathTimer += dt; if (deathTimer > 2.6) { ui.showDeath(true); document.exitPointerLock?.(); } }
    if (player.alive && deathTimer > 0) { deathTimer = 0; }
  }

  // HUD
  ui.setHealth(player.health);
  ui.setNoise(player.noise);
  ui.setStruggle(player.carriedBy ? player.struggle : null);
  ui.hit(player.hurtFlash * 1.0 + (player.carriedBy ? 0.35 : 0));
  post.grade.uniforms.uTime.value = totalTime;
  post.grade.uniforms.uDamage.value = Math.min(1, player.hurtFlash + (player.carriedBy ? 0.35 : 0));
  const c = post.grade.uniforms.uCaught;
  c.value += ((player.carriedBy || !player.alive ? 1 : 0) - c.value) * Math.min(1, dt * 4);

  // follow-camera systems
  sky.position.copy(camera.position);
  sky.scale.setScalar(1);
  sky.material.uniforms.uTime.value = totalTime;
  const g = scene.userData.grass;
  g.userData.uniforms.uCam.value.copy(camera.position);
  g.userData.uniforms.uPush.value.copy(player.ghost ? new THREE.Vector3(0, -999, 0) : player.position);
  scene.traverse((o) => { if (o.isPoints) o.material.uniforms.uCam.value.copy(camera.position); });
  const cx = Math.round(camera.position.x / 3) * 3, cz = Math.round(camera.position.z / 3) * 3;
  sun.target.position.set(cx, terrainHeight(cx, cz), cz);
  sun.position.copy(sun.target.position).addScaledVector(SKY.sunDir, 220);
  sun.target.updateMatrixWorld();
  camera.updateMatrixWorld();
  sunV.copy(SKY.sunDir).transformDirection(camera.matrixWorldInverse);
  Shared.uSunDirView.value.copy(sunV);

  if (!noRender) post.composer.render();

  // fps + adaptive resolution
  fpsAcc += dt; fpsFrames++; ema += (dt - ema) * 0.05;
  if (fpsAcc > 0.5) { ui.setFps(`${Math.round(fpsFrames / fpsAcc)} fps · ${Math.round(curPR * 100)}% res`); fpsAcc = 0; fpsFrames = 0; }
  adaptT += dt;
  if (adaptT > 1.5 && !params.has('pr')) {
    adaptT = 0;
    const fps = 1 / ema;
    let next = curPR;
    if (fps < 38) next = Math.max(0.5, curPR - 0.125);
    else if (fps > 58) next = Math.min(basePR, curPR + 0.0625);
    if (next !== curPR) { curPR = next; renderer.setPixelRatio(curPR); post.composer.setPixelRatio(curPR); post.composer.setSize(innerWidth, innerHeight); }
  }
}

// ---------------------------------------------------------------------------
function boot() {
  buildWorld();
  player = new Player(camera, canvas, colliders);
  player.on('escaped', () => ui.toast('Break free!', 'good'));
  audio = new AudioEngine(camera);
  post = createComposer(renderer, scene, camera, { bloom: !LOW });
  ui.ready();
  // handy hooks for tests / tinkering from the console
  window.__frontier = {
    THREE, scene, camera, renderer, player, predators, decoys, baits, STATE,
    setCam(x, y, z, tx, ty, tz) {
      player.ghost = true; ui.setMode('observer'); mode = 'observer';
      camera.position.set(x, y, z);
      const m = new THREE.Matrix4().lookAt(camera.position, new THREE.Vector3(tx, ty, tz), new THREE.Vector3(0, 1, 0));
      const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
      player.yaw = e.y; player.pitch = e.x;
    },
    addScout, lureNearest,
    force(i, state, tgt) {
      const p = predators[i]; tgt = tgt || baits[0] || player;
      p.target = tgt; p._enter(state, tgt, { audio });
      if (state === STATE.ALERT) p.stateT = 0;
    },
    start,
  };
  clock.start();
  if (params.has('manual')) {
    // deterministic stepping for automated captures: __frontier.step(dt, n) then __frontier.snap()
    window.__frontier.step = (dt = 1 / 30, n = 1) => { for (let i = 0; i < n; i++) frame(dt, true); return totalTime; };
    window.__frontier.snap = () => { frame(0.0001); return canvas.toDataURL('image/jpeg', 0.92); };
  } else requestAnimationFrame(frame);
  if (params.has('auto')) { document.getElementById('start').classList.add('hidden'); document.getElementById('hud').classList.remove('hidden'); paused = false; started = true; params.has('observer') && setMode('observer'); params.has('cam') && window.__frontier.setCam(...params.get('cam').split(',').map(Number)); }
}

try { boot(); } catch (e) { console.error(e); document.getElementById('loading').textContent = 'Error: ' + e.message; }
