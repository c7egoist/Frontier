// Entry point: renderer, chase camera, menus and the main loop.

import * as THREE from 'three';
import { EffectComposer } from './../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './../vendor/three/addons/postprocessing/OutputPass.js';
import { Race } from './race.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { bindInput, readDriver, pollPad, clamp } from './input.js';
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);

const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.3, 4000);
let scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.FogExp2(0x1a0c33, 0.0016);

const composer = new EffectComposer(renderer);
let renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const hud = new HUD();
const audio = new Audio();

const settings = { mode: 'solo', difficulty: 'pro' };
let state = 'menu';         // menu | playing | paused | results
let race = null;
let pendingCall = null;     // lane requested by the caller this frame
let lastT = performance.now() / 1000;
let shakeT = 0;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camReady = false;

// ---------- Menu wiring --------------------------------------------------------
document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
  settings.mode = b.dataset.mode;
  document.querySelectorAll('#modeSeg button').forEach((x) => x.classList.toggle('on', x === b));
  audio.init();
}));
document.querySelectorAll('#diffSeg button').forEach((b) => b.addEventListener('click', () => {
  settings.difficulty = b.dataset.diff;
  document.querySelectorAll('#diffSeg button').forEach((x) => x.classList.toggle('on', x === b));
  audio.init();
}));
$('startBtn').addEventListener('click', () => startRace());
$('resumeBtn').addEventListener('click', () => togglePause());
$('restartBtn').addEventListener('click', () => restart());
$('menuBtn').addEventListener('click', () => toMenu());
$('againBtn').addEventListener('click', () => restart());
$('toMenuBtn').addEventListener('click', () => toMenu());

bindInput({
  onCallerLane: (lane) => {
    if (state !== 'playing' && state !== 'paused') return;
    if (state === 'paused') return;
    pendingCall = lane;
    audio.init();
    audio.lane(lane);
  },
  onCallerNudge: (dir) => {
    if (state !== 'playing') return;
    const cur = race.zipper.cmd;
    pendingCall = clamp(cur + dir, 0, CFG.LANES - 1);
  },
  onPause: () => {
    if (state === 'playing' || state === 'paused') togglePause();
  },
  onRestart: () => {
    if (state === 'playing' || state === 'paused' || state === 'results') restart();
  },
  onMute: () => {
    audio.init();
    const m = audio.toggleMute();
    hud.toast(m ? 'Muted' : 'Sound on', 'info');
  },
  onConfirm: () => {
    if (state === 'menu') startRace();
    else if (state === 'results') restart();
  },
  onNav: () => {},
});

// ---------- Race lifecycle -------------------------------------------------------
function disposeScene(s) {
  s.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}

function buildRace() {
  if (race) {
    disposeScene(scene);
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.fog = new THREE.FogExp2(0x1a0c33, 0.0016);
  renderPass = new RenderPass(scene, camera);
  composer.passes[0] = renderPass;
  race = new Race(scene, { mode: settings.mode, difficulty: settings.difficulty, seed: 11 });
  hud.buildMinimap(race.track);
  camReady = false;
  pendingCall = null;
}

function startRace() {
  audio.init();
  buildRace();
  state = 'playing';
  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  hud.show(true);
  hud.centre('READY', { duration: 0.8 });
}

function restart() {
  $('results').classList.add('hidden');
  $('pause').classList.add('hidden');
  startRace();
}

function toMenu() {
  state = 'menu';
  $('menu').classList.remove('hidden');
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  hud.show(false);
  audio.setMuted(audio.muted);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    $('pause').classList.remove('hidden');
    audio.engine(0, 0, false, false);
  } else if (state === 'paused') {
    state = 'playing';
    $('pause').classList.add('hidden');
  }
}

function showResults() {
  state = 'results';
  hud.results(race, race.player.finished && race.standings()[0] === race.player ? 'VICTORY' : 'RACE COMPLETE');
  $('results').classList.remove('hidden');
  audio.finish();
}

// ---------- Event handling -------------------------------------------------------
function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'tick':
        audio.tick(false);
        hud.centre(String(e.n), { duration: 0.85 });
        break;
      case 'go':
        audio.go();
        hud.centre('GO!', { go: true, duration: 1.0 });
        break;
      case 'msg':
        hud.toast(e.text, e.tone);
        break;
      case 'lane':
        if (e.manual) hud.toast(`Gap drawn → lane ${e.lane + 1}`, 'info');
        break;
      case 'train_warn':
        audio.horn();
        hud.toast('Train crossing', 'info');
        break;
      case 'train_pass':
        audio.alarm();
        break;
      case 'sfx':
        playSfx(e);
        break;
      case 'lap':
        if (e.lap && e.lapTime !== undefined) {
          hud.toast(`Lap ${e.lap} · ${formatLap(e.lapTime)}`, 'good');
          $('lastLap').textContent = 'LAST ' + formatLap(e.lapTime);
        }
        break;
      case 'finish':
        if (e.place === 1) hud.centre('FINISH', { go: true, duration: 1.6 });
        else hud.toast(`P${e.place} finish`, 'info');
        break;
      default:
        break;
    }
  }
}

function playSfx(e) {
  const near = !e.car || e.car.isPlayer ? 1 : 0.35;
  switch (e.name) {
    case 'bollard': audio.bollard(); break;
    case 'zip': if (e.car.isPlayer) audio.zip(); break;
    case 'impact': audio.impact((e.power || 5) * near); break;
    case 'jump': if (e.car.isPlayer) audio.jump(); break;
    case 'land': if (e.car.isPlayer) audio.land(); break;
    case 'boost': if (e.car.isPlayer) audio.boost(); break;
    default: break;
  }
}

function formatLap(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

// ---------- Camera ----------------------------------------------------------------
const _tmpA = [0, 0, 0], _tmpB = [0, 0, 0];
function updateCamera(dt) {
  const p = race.player;
  const track = race.track;
  const speed = p.v;
  const back = 9.5 + speed * 0.02;
  const up = 3.4 + Math.min(1.5, Math.abs(p.vx) * 0.05) + (p.airborne ? 0.6 : 0);
  const rel = p.y - track.frame(p.dist, _f).H;
  const target = track.worldPoint(p.dist - back, p.x * 0.35, up + rel * 0.35, _tmpA);
  const look = track.worldPoint(p.dist + 14 + speed * 0.12, p.x * 0.5, 1.0 + rel * 0.5, _tmpB);
  const tv = new THREE.Vector3(target[0], target[1], target[2]);
  const lv = new THREE.Vector3(look[0], look[1], look[2]);
  if (!camReady) {
    camPos.copy(tv);
    camLook.copy(lv);
    camReady = true;
  } else {
    const k = 1 - Math.exp(-dt * 9);
    camPos.lerp(tv, k);
    camLook.lerp(lv, 1 - Math.exp(-dt * 14));
  }
  camera.position.copy(camPos);
  if (race.shake > 0) {
    const amt = race.shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * amt;
    camera.position.y += (Math.random() - 0.5) * amt;
    camera.position.z += (Math.random() - 0.5) * amt;
  }
  camera.lookAt(camLook);
  const targetFov = 64 + Math.min(16, speed * 0.1) + (p.boostingVis ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
}
const _f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };

// ---------- Main loop --------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  let dt = Math.min(1 / 30, t - lastT);
  lastT = t;
  if (!(dt > 0)) dt = 1 / 60;

  pollPad();

  if (race && (state === 'playing' || state === 'results')) {
    if (state === 'playing') {
      const driver = readDriver();
      const call = pendingCall;
      pendingCall = null;
      handleEvents(race.update(dt, driver, call));
      if (race.phase === 'results') showResults();
      audio.engine(race.player.v, race.player.input.throttle, race.player.boostingVis, true);
      hud.update(race, settings.mode, dt);
    } else {
      // results: keep the world ticking gently for atmosphere
      race.world.update(race.time, dt);
      race.particles.update(dt);
    }
    updateCamera(dt);
  } else if (race) {
    // menu or paused: the frozen world stays on screen
    updateCamera(0);
  }

  if (race) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

// Attach the menu-time world so the background isn't empty.
function buildMenuBackdrop() {
  race = new Race(scene, { mode: 'solo', difficulty: 'pro', seed: 11 });
  race.phase = 'menu';
  hud.buildMinimap(race.track);
  camReady = false;
}

buildMenuBackdrop();
requestAnimationFrame(frame);

// Expose a tiny debug handle for automated checks.
window.__frontier = { get race() { return race; }, get state() { return state; }, startRace, togglePause, settings, audio };
