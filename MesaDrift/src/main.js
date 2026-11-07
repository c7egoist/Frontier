import * as THREE from 'three';
import { Track, clamp, lerp, smooth, HALF_PI, TURN_R } from './track.js';
import { Player } from './player.js';
import { createWorld, Fx } from './world.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.3, 2600);
const world = createWorld(scene);
const fx = new Fx(scene);
const track = new Track(scene);
const player = new Player(scene);
const input = new Input(canvas);
const hud = new Hud();
const sfx = new Sfx();

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camY = 0, shake = 0, time = 0;

const game = {
  state: 'title', score: 0, coins: 0, tricks: 0, mult: 1, chainT: 0,
  best: +(localStorage.getItem('mesa-drift-best') || 0), sfx,

  addScore(p) { this.score += p * this.mult; },
  addTrick(label, pts) {
    this.chainT = 4; this.mult = Math.min(5, this.mult + 1); this.tricks++;
    this.addScore(pts); hud.popup(label, pts * this.mult, label.startsWith('PERFECT') || label === 'BIG AIR' ? 'big' : '');
    sfx.trick();
  },
  onLaunch() { sfx.jump(); },
  onLand(air, jumped) {
    sfx.land();
    for (let i = 0; i < 8; i++) fx.spawn(player.local((Math.random() - 0.5) * 1.6, 0.1, (Math.random() - 0.5) * 2, tmpA), 0xE8D7BC, 0.9,
      tmpB.set((Math.random() - 0.5) * 4, Math.random() * 1.5, (Math.random() - 0.5) * 4), 0.6, 2, 1);
    if (air >= 1.05) this.addTrick('BIG AIR', 150);
    else if (air >= 0.55) this.addTrick('AIR', Math.round(air * 70));
  },
  onScrape(dt) {
    if (Math.random() < dt * 40) {
      const side = Math.sign(player.x);
      track.toWorld(player.s, player.x + side * 0.8, player.y + 0.3, tmpA);
      fx.spawn(tmpA, 0xFFD27A, 0.35, tmpB.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.35, 0.5, -8);
      if (Math.random() < 0.3) sfx.scrape();
    }
    shake = Math.max(shake, 0.12);
  },
  onFall() {
    sfx.fall(); hud.flash('hit'); player.hearts--; hud.popup('FELL', 0, 'bad');
    if (player.hearts <= 0) return this.end();
    let gs = player.s + 2;
    for (let i = 0; i < 60; i++, gs += 2) {
      if (!track.floors(gs, 0).length) continue;
      let blocked = false;
      track.nearItems(gs, 8, (it) => { if (it.kind !== 'coin' && it.kind !== 'boost' && it.kind !== 'heart') blocked = true; });
      if (!blocked) break;
    }
    player.respawnAt(track, gs); this.mult = 1; this.chainT = 0; snapCamera();
  },
  onItem(it, pl) {
    switch (it.kind) {
      case 'coin': it.alive = false; it.mesh.visible = false; this.coins++; this.addScore(10); sfx.coin(); break;
      case 'boost': it.alive = false; pl.boostTime = 2.4; pl.speed += 6; sfx.boost(); hud.popup('BOOST', 0, 'boost'); break;
      case 'heart': it.alive = false; it.mesh.visible = false; pl.hearts = Math.min(3, pl.hearts + 1); sfx.heart(); hud.popup('REPAIR', 0, 'good'); break;
      case 'cone':
        it.alive = false; it.mesh.visible = false; pl.speed *= 0.86; sfx.bump(); shake = 0.25;
        for (let i = 0; i < 6; i++) fx.spawn(it.mesh.position, 0xE0A23F, 0.5, tmpB.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6), 0.5, 0.5, -6);
        break;
      default: {
        if (pl.invuln > 0) return;
        pl.hearts--; pl.invuln = 1.6; pl.speed *= 0.45; this.mult = 1; this.chainT = 0;
        sfx.hit(); hud.flash('hit'); shake = 0.7;
        if (it.kind === 'block') { it.alive = false; it.mesh.visible = false; }
        for (let i = 0; i < 14; i++) fx.spawn(player.local(0, 0.6, 1.2, tmpA), i % 2 ? 0xD8CBB0 : 0xB5543B, 0.6,
          tmpB.set((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8), 0.7, 0.8, -9);
        hud.popup('CRASH', 0, 'bad');
        if (pl.hearts <= 0) this.end();
      }
    }
  },
  start() {
    sfx.unlock();
    track.reset((Date.now() & 0xffff) | 1); player.reset();
    this.score = 0; this.coins = 0; this.tricks = 0; this.mult = 1; this.chainT = 0; this.state = 'run';
    hud.showRun(); hud.setHearts(3); hud.setScore(0); hud.setCoins(0); hud.setMult(1);
    hud.showHint('STEER  ·  JUMP  ·  DUCK  ·  HOLD DRIFT IN CORNERS', 3.5);
    snapCamera();
  },
  end() {
    this.state = 'over'; player.dead = true; sfx.drift(false); sfx.engine(0, false);
    const isBest = this.score > this.best; if (isBest) { this.best = this.score; localStorage.setItem('mesa-drift-best', String(Math.floor(this.score))); }
    hud.showOver({ score: this.score, coins: this.coins, dist: player.distance, tricks: this.tricks, best: this.best, isBest });
  },
};

function snapCamera() {
  camY = player.y;
  track.toWorld(player.s - 9, player.x * 0.6, camY + 4.3, camera.position);
  track.toWorld(player.s + 14, player.x * 0.3, camY + 1, camLook);
  camera.lookAt(camLook);
}

function followCamera(dt) {
  const p = player;
  camY += (p.y - camY) * Math.min(1, dt * 5);
  const back = 8.5 + p.speed * 0.045;
  const driftOff = -p.driftYaw * 2.5;
  const cs = p.s - back, cx = p.x * 0.6 + driftOff;
  let camH = 4.3 + p.speed * 0.01;
  // duck the camera under low ceilings (lower level of a split deck)
  for (const f of track.floors(cs, cx)) if (f > camY + 1 && f - camY - 1.0 < camH) camH = Math.max(1.4, f - camY - 1.0);
  track.toWorld(cs, cx, camY + camH, tmpA);
  track.toWorld(p.s + 14, p.x * 0.3, camY + 1.0, tmpB);
  const k = 1 - Math.exp(-dt * 7);
  camera.position.lerp(tmpA, k); camLook.lerp(tmpB, k);
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.6);
    camera.position.x += (Math.random() - 0.5) * shake * 0.8; camera.position.y += (Math.random() - 0.5) * shake * 0.6;
  }
  camera.lookAt(camLook);
  const sr = clamp((p.speed - 27) / 45, 0, 1);
  const fov = 64 + sr * 14 + (p.boostTime > 0 ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

function idleCamera(dt) {
  const a = time * 0.25;
  track.toWorld(player.s + Math.cos(a) * 9, Math.sin(a) * 9, 3.2 + Math.sin(time * 0.5) * 0.4, tmpA);
  camera.position.lerp(tmpA, 1 - Math.exp(-dt * 3));
  track.toWorld(player.s + 2, 0, 1.0, tmpB); camLook.lerp(tmpB, 1 - Math.exp(-dt * 3));
  camera.lookAt(camLook);
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  time += dt;

  if (input.consumeStart() && game.state !== 'run') game.start();

  if (game.state === 'run') {
    track.ensure(player.s);
    player.update(dt, input, track, game);
    if (game.state === 'run') {
      game.addScore(player.speed * dt * 0.5 / game.mult); // distance score isn't multiplied
      if (game.chainT > 0) { game.chainT -= dt; if (game.chainT <= 0) game.mult = 1; }
      if (player.drifting && Math.random() < dt * 60) {
        for (const sx of [-0.9, 0.9]) fx.spawn(player.local(sx, 0.15, -1.1, tmpA), 0xF1E6D2, 0.8,
          tmpB.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2), 0.6, 2.5, 2);
      }
      if (player.boostTime > 0 && Math.random() < dt * 30) {
        fx.spawn(player.local((Math.random() - 0.5) * 0.6, 0.45, -1.5, tmpA), 0x2F7F7C, 0.5, tmpB.set(0, 0.5, 0), 0.3, 1.5, 0);
      }
      followCamera(dt);
      const turn = player.piece && player.piece.type === 'turn';
      const driftRatio = clamp((player.driftMeter * player.speed) / (HALF_PI * TURN_R), 0, 1);
      hud.setDrift(driftRatio, turn, player.drifting);
      hud.setScore(game.score); hud.setCoins(game.coins); hud.setHearts(player.hearts); hud.setMult(game.mult);
      hud.setSpeed(clamp((player.speed - 20) / 55, 0, 1), player.boostTime > 0); hud.setDist(player.distance);
      sfx.engine(clamp((player.speed - 20) / 55, 0, 1), true);
    }
  } else {
    idleCamera(dt);
  }

  hud.tick(dt);
  track.update(dt, time);
  fx.update(dt);
  world.update(camera.position, player.mesh.position);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
for (const id of ['title', 'over']) document.getElementById(id).addEventListener('click', () => { if (game.state !== 'run') game.start(); });
input.onGesture = () => sfx.unlock();
input.onToggleMute = () => { sfx.setMuted(!sfx.muted); hud.showHint(sfx.muted ? 'MUTED' : 'SOUND ON', 1); };

track.reset(7);
hud.showTitle(game.best);
snapCamera();
frame();
