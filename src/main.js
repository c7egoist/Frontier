import * as THREE from 'three';
import { CFG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { ChaseCam } from './camera.js';
import { PostFX, Particles } from './effects.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { clamp } from './utils.js';

const canvas = document.getElementById('c');

function fatal(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:40px;z-index:99;background:#05010c;color:#eafcff;font:14px/1.7 ui-monospace,monospace;white-space:pre-wrap;text-align:center';
  el.textContent = 'NEON RIFT hit a snag\n\n' + msg;
  document.body.appendChild(el);
}
window.addEventListener('error', (e) => {
  if (!window.__nrBooted) fatal(e.message + '\n' + (e.filename || ''));
});
window.__nrBooted = false;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (err) {
  document.body.innerHTML = '<div style="color:#fff;font:14px monospace;padding:40px">WebGL is required to run FRONTIER // NEON RIFT.</div>';
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.fovBase, window.innerWidth / window.innerHeight, 0.15, 4600);

const world = new World(scene, renderer);
const player = new Player(scene, world);
const chase = new ChaseCam(camera);
const particles = new Particles(scene);
const fx = new PostFX(renderer, scene, camera);
const audio = new AudioEngine();
const hud = new HUD();
const input = new Input();

input.attach();

let state = 'menu';
let best = Number(localStorage.getItem('frontier.neonrift.best') || 0);
let time = 0;
let lastSpawn = 0;
let driftSoundT = 0;

hud.setBest(best);
hud.showScreen('menu');
player.root.visible = false;
camera.fov = 68;
camera.updateProjectionMatrix();
fx.setSize(window.innerWidth, window.innerHeight);

world.ensureAhead(CFG.genAhead);
chase.cinematic(0, world);

/* ------------------------------------------------------------------ events */
const ev = {
  coin(c) {
    audio.coin();
    particles.burst({ x: c.px, y: c.py, z: c.pz }, 5, {
      speed: 5, life: 0.42, size: 0.34, color: [0.7, 1.9, 1.1], grav: 2,
    });
  },
  jump() { audio.jump(); },
  launch() {
    audio.launch();
    particles.burst(player.pos, 18, { speed: 10, life: 0.5, size: 0.45, color: [2.0, 0.75, 0.25], vy: 3 });
  },
  land(t) {
    audio.land(t * 2);
    particles.burst(player.pos, t > 0.5 ? 16 : 8, {
      speed: 7, life: 0.45, size: 0.5, color: [0.4, 1.5, 2.2], grav: 14, spread: 1.2,
    });
    if (t > 0.75) hud.callout('BIG AIR', true);
    else if (t > 0.5) hud.callout('CLEAN LANDING');
  },
  hit() {
    audio.crash();
    fx.pulse(0.95);
    hud.callout('IMPACT', true);
    particles.burst(player.pos, 30, { speed: 16, life: 0.7, size: 0.55, color: [2.2, 0.45, 0.7], grav: 16, spread: 1.4 });
  },
  dead() {
    audio.crash();
    audio.gameOver();
    fx.pulse(1.3);
    particles.burst(player.pos, 60, { speed: 22, life: 1.1, size: 0.7, color: [2.4, 0.5, 0.8], grav: 18, spread: 2 });
    endRun();
  },
  trick(t) { hud.trick(t + '  +75'); },
  callout(t, hot) { hud.callout(t, hot); },
  grind() {
    audio.padHit();
    particles.burst(player.pos, 14, { speed: 9, life: 0.5, size: 0.4, color: [1.6, 2.0, 0.4] });
    hud.callout('GRIND', false);
  },
  pad() {
    audio.boost();
    particles.burst(player.pos, 14, { speed: 8, life: 0.5, size: 0.4, color: [0.4, 1.8, 2.4] });
  },
  sparks() {
    particles.burst(player.pos, 10, { speed: 9, life: 0.4, size: 0.34, color: [2.2, 1.4, 0.3], grav: 20 });
    audio.skid();
  },
  slide() {},
  driftStart() { audio.skid(); },
};

/* ------------------------------------------------------------------- flow */
function startRun() {
  audio.init();
  audio.resume();
  world.reset();
  player.reset();
  world.ensureAhead(player.s + CFG.genAhead);
  world.camPos = camera.position;
  player.root.visible = true;
  chase.snap(player, world);
  hud.showScreen('play');
  hud.setTurn(0);
  state = 'play';
  hud.callout('GO', true);
  audio.ui();
}

function endRun() {
  state = 'dead';
  const isBest = player.score > best;
  if (isBest) {
    best = Math.floor(player.score);
    try { localStorage.setItem('frontier.neonrift.best', String(best)); } catch (e) { /* ignore */ }
    hud.setBest(best);
  }
  hud.gameOver(player, best, isBest);
}

input.onStart = () => {
  if (state === 'menu') startRun();
  else if (state === 'dead') startRun();
};
input.onRetry = () => { if (state === 'dead') startRun(); };
input.onMute = () => toggleMute();

document.getElementById('startbtn').addEventListener('click', () => { audio.init(); startRun(); });
document.getElementById('retrybtn').addEventListener('click', () => startRun());
const muteBtn = document.getElementById('mutebtn');
muteBtn.addEventListener('click', toggleMute);
function toggleMute() {
  audio.init();
  const on = audio.toggle();
  hud.toggleMuteIcon(on);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fx.setSize(w, h);
});

/* ------------------------------------------------------------------- loop */
const clock = new THREE.Clock();
let speedN = 0;
const rear = new THREE.Vector3();
const yawOf = () => world.path.frameAt(player.s).yaw;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;

  input.compute();

  if (state === 'play') {
    player.update(dt, input, ev);

    const f = world.path.frameAt(player.s);
    speedN = clamp((player.speed - CFG.startSpeed) / (CFG.maxSpeed - CFG.startSpeed), 0, 1.3);

    // rear of the board, used for sparks + boost trail
    rear.set(
      player.pos.x - Math.sin(f.yaw) * 2.6,
      player.pos.y + 0.35,
      player.pos.z - Math.cos(f.yaw) * 2.6
    );

    if (player.drifting && player.grounded) {
      for (let i = 0; i < 2; i++) {
        particles.spawn(
          rear.x + (Math.random() - 0.5) * 1.4,
          rear.y, rear.z + (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 5 - Math.sin(f.yaw) * 6,
          1 + Math.random() * 3,
          (Math.random() - 0.5) * 5 - Math.cos(f.yaw) * 6,
          0.35 + Math.random() * 0.3, 0.42,
          [2.2, 1.1 + Math.random() * 0.8, 0.25], 3, 10
        );
      }
      driftSoundT -= dt;
      if (driftSoundT <= 0) { audio.skid(); driftSoundT = 0.18; }
    }
    if (player.boosting) {
      for (let i = 0; i < 3; i++) {
        particles.spawn(
          rear.x + (Math.random() - 0.5) * 1.1,
          rear.y + (Math.random() - 0.5) * 0.5,
          rear.z + (Math.random() - 0.5) * 1.0,
          (Math.random() - 0.5) * 3 - Math.sin(f.yaw) * 14,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3 - Math.cos(f.yaw) * 14,
          0.4, 0.6, [1.6, 0.5, 2.2], 2.5, 0
        );
      }
    }
    // constant hover trail so speed always reads
    if (time - lastSpawn > 0.018) {
      lastSpawn = time;
      particles.spawn(
        rear.x + (Math.random() - 0.5) * 0.9,
        rear.y - 0.15,
        rear.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 1.5 - Math.sin(f.yaw) * 3,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 1.5 - Math.cos(f.yaw) * 3,
        0.26, 0.3,
        [0.35, 1.0, 1.5], 3.5, 1.5
      );
    }
    if (player.grinding) {
      if (time - lastSpawn > 0.03) {
        lastSpawn = time;
        particles.spawn(rear.x, rear.y - 0.6, rear.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4,
          0.4, 0.4, [1.8, 2.2, 0.5], 2, 12);
      }
    }

    world.update(dt, player.s, time);
    chase.update(dt, player, world);

    const turn = world.upcomingTurn(player.s, 95);
    hud.setTurn(turn ? -Math.sign(turn.angle) : 0);
    hud.update(dt, player, best);
    audio.update(dt, speedN);
  } else if (state === 'menu') {
    world.update(dt, 0, time);
    chase.cinematic(time, world);
    audio.update(dt, 0.15);
  } else {
    player.shake = Math.max(0, player.shake - dt * 1.4);
    world.update(dt * 0.35, player.s, time);
    chase.update(dt * 0.5, player, world);
  }

  particles.update(dt);

  // player lights
  world.playerLight.position.set(player.pos.x, player.pos.y + 3.2, player.pos.z);
  world.playerLight.intensity = state === 'play' ? 70 : 0;
  world.boostLight.position.copy(player.pos);
  world.boostLight.intensity = player.boosting ? 55 : 0;
  world.camPos = camera.position;

  fx.update(dt, state === 'play' ? speedN : 0.1, player.boosting && state === 'play');
  fx.render();
  input.endFrame();
}

window.__nrBooted = true;
tick();
