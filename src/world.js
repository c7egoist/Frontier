import * as THREE from 'three';
import { CFG } from './config.js';
import { TrackPath } from './path.js';
import { CoursePlanner } from './generator.js';
import { TrackBuilder } from './track.js';
import { createMaterials } from './materials.js';
import { disposeTree, clamp } from './utils.js';

const MAX_COINS = 900;

function sunTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  const g = x.createLinearGradient(0, 60, 0, 452);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.35, '#ff9a3c');
  g.addColorStop(0.7, '#ff2e93');
  g.addColorStop(1, '#7a1bd0');
  x.fillStyle = g;
  x.beginPath();
  x.arc(256, 256, 196, 0, Math.PI * 2);
  x.fill();
  // synthwave slits
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 11; i++) {
    const y = 268 + i * 17;
    const h = 2 + i * 1.15;
    x.fillRect(40, y, 432, h);
  }
  x.globalCompositeOperation = 'source-over';
  // inner glow ring
  const rg = x.createRadialGradient(256, 256, 120, 256, 256, 210);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(0.75, 'rgba(255,120,220,0.28)');
  rg.addColorStop(1, 'rgba(255,120,220,0)');
  x.fillStyle = rg;
  x.beginPath(); x.arc(256, 256, 210, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKY_VERT = `
  varying vec3 vP;
  void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

const SKY_FRAG = `
  varying vec3 vP;
  void main(){
    vec3 d = normalize(vP);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 low  = vec3(0.30, 0.03, 0.20);
    vec3 mid  = vec3(0.09, 0.015, 0.20);
    vec3 high = vec3(0.012, 0.004, 0.055);
    vec3 col = mix(low, mid, smoothstep(0.42, 0.60, h));
    col = mix(col, high, smoothstep(0.58, 0.92, h));
    col += vec3(0.30, 0.05, 0.22) * exp(-pow((d.y - 0.02) * 7.0, 2.0)) * 0.55;
    float band = sin(d.x * 3.2 + d.z * 2.1) * 0.5 + 0.5;
    col += vec3(0.02, 0.10, 0.16) * pow(band, 6.0) * smoothstep(0.15, 0.75, h);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.mats = createMaterials();
    this.path = new TrackPath(0, 0, 0, 0);
    this.planner = new CoursePlanner(20260207);
    this.builder = new TrackBuilder(scene, this.path, this.mats);
    this.segments = [];
    this.obstacles = [];
    this.drones = [];
    this.ramps = [];
    this.rails = [];
    this.pads = [];
    this.coins = [];
    this.coinTimer = 0;
    this.routeTex = this.mats.route.map;

    this.buildEnvironment();
    this.buildEnvMap();
    this.buildCoins();
  }

  /* ------------------------------------------------------------ scenery */
  buildEnvironment() {
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0x140328, CFG.fogDensity);
    scene.background = new THREE.Color(0x05010c);

    // --- sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 20), skyMat);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // --- stars
    const starCount = 900;
    const sp = new Float32Array(starCount * 3);
    const sc = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.12 + Math.random() * 0.86;
      const r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * r * 2500;
      sp[i * 3 + 1] = y * 2500;
      sp[i * 3 + 2] = Math.sin(a) * r * 2500;
      const t = Math.random();
      sc[i * 3] = 0.7 + t * 0.6;
      sc[i * 3 + 1] = 0.8 + t * 0.5;
      sc[i * 3 + 2] = 1.2;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // --- sun
    const sunDir = new THREE.Vector3(-0.42, 0.11, -0.9).normalize();
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTexture(), transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false, opacity: 0.95,
    }));
    this.sunSprite.position.copy(sunDir).multiplyScalar(2300);
    this.sunSprite.scale.setScalar(1150);
    this.sunSprite.renderOrder = -2;
    scene.add(this.sunSprite);
    this.sunDir = sunDir;

    // --- glowing grid floor far below
    const groundMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: {
        uColorA: { value: new THREE.Color(0.10, 0.75, 1.0) },
        uColorB: { value: new THREE.Color(1.0, 0.18, 0.75) },
      },
      vertexShader: `
        varying vec3 vW;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
      `,
      fragmentShader: `
        varying vec3 vW;
        uniform vec3 uColorA; uniform vec3 uColorB;
        float grid(vec2 p, float scale){
          vec2 q = p * scale;
          vec2 g = abs(fract(q) - 0.5) / max(fwidth(q), vec2(0.0001));
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main(){
          float far = length(vW.xz) / 1600.0;
          float fade = 1.0 - smoothstep(0.15, 1.0, far);
          float g1 = grid(vW.xz, 0.018);
          float g2 = grid(vW.xz, 0.0022) * 1.6;
          vec3 col = vec3(0.012, 0.002, 0.030);
          col += uColorA * g1 * 0.55 * fade;
          col += uColorB * g2 * 0.60 * fade;
          col += vec3(0.16,0.02,0.20) * exp(-far*2.2) * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -46;
    scene.add(ground);
    this.ground = ground;

    // --- lights
    scene.add(new THREE.HemisphereLight(0x4a6cff, 0x180428, 0.75));
    const key = new THREE.DirectionalLight(0xff5fd0, 1.5);
    key.position.set(-60, 40, -40);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x2fe6ff, 1.0);
    rim.position.set(70, 30, 50);
    scene.add(rim);

    this.playerLight = new THREE.PointLight(0x66f0ff, 55, 60, 2);
    scene.add(this.playerLight);
    this.boostLight = new THREE.PointLight(0xff48d0, 0, 45, 2);
    scene.add(this.boostLight);
  }

  buildEnvMap() {
    // small PMREM from a proxy sky so metals pick up the neon city
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), mat);
    envScene.add(dome);
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.2, 1.1) })
    );
    sun.position.set(-26, 10, -48);
    sun.lookAt(0, 0, 0);
    envScene.add(sun);
    const glowC = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.4, 2.2) })
    );
    glowC.position.set(40, 4, 20);
    glowC.lookAt(0, 0, 0);
    envScene.add(glowC);

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const rt = pmrem.fromScene(envScene, 0.05);
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.75;
      pmrem.dispose();
    } catch (e) {
      console.warn('env map skipped', e);
    }
    envScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  buildCoins() {
    const geom = new THREE.TorusGeometry(0.62, 0.16, 8, 18);
    const mesh = new THREE.InstancedMesh(geom, this.mats.coin, MAX_COINS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    this.coinMesh = mesh;
    this.coinDummy = new THREE.Object3D();
  }

  /* ------------------------------------------------------------- build */
  reset() {
    for (const seg of this.segments) {
      this.scene.remove(seg.group);
      disposeTree(seg.group);
      for (const d of seg.drones) this.scene.remove(d.mesh);
    }
    this.segments.length = 0;
    this.obstacles.length = 0;
    this.drones.length = 0;
    this.ramps.length = 0;
    this.rails.length = 0;
    this.pads.length = 0;
    this.coins.length = 0;
    this.liveCoins = [];
    this.coinMesh.count = 0;
    this.path = new TrackPath(0, 0, 0, 0);
    this.planner = new CoursePlanner((Math.random() * 1e9) | 0);
    this.builder = new TrackBuilder(this.scene, this.path, this.mats);
    this.prevBuilt = null;
  }

  ensureAhead(s) {
    let guard = 0;
    while (this.path.total < s + CFG.genAhead && guard++ < 40) {
      const spec = this.planner.next();
      let seg;
      if (spec.kind === 'turn') {
        seg = this.path.addTurn(spec.angle, spec.radius, spec.dy, { style: spec.style, bank: 0.2 });
      } else {
        seg = this.path.addStraight(spec.len, spec.dy, { style: spec.style });
      }
      seg.spec = spec;

      const built = this.builder.build(seg, spec, this.prevBuilt);
      this.prevBuilt = { seg, spec };
      const record = {
        group: built.group, s0: seg.s0, s1: seg.s1,
        obstacles: built.obstacles, drones: built.drones, ramps: built.ramps,
        rails: built.rails, pads: built.pads, coins: [],
      };

      for (const c of built.coins) {
        c.alive = true;
        c.phase = Math.random() * Math.PI * 2;
        record.coins.push(c);
        this.coins.push(c);
      }
      for (const o of built.obstacles) this.obstacles.push(o);
      for (const d of built.drones) {
        d.curX = d.baseX;
        this.drones.push(d);
        this.scene.add(d.mesh);
      }
      for (const r of built.ramps) this.ramps.push(r);
      for (const r of built.rails) this.rails.push(r);
      for (const p of built.pads) this.pads.push(p);

      this.segments.push(record);
      this.idxCoins();
    }
  }

  idxCoins() {
    const live = this.coins.filter((c) => c.alive);
    this.coinMesh.count = Math.min(live.length, MAX_COINS);
    this.liveCoins = live;
  }

  prune(s) {
    while (this.segments.length && this.segments[0].s1 < s - CFG.pruneBehind) {
      const seg = this.segments.shift();
      this.scene.remove(seg.group);
      disposeTree(seg.group);
      for (const d of seg.drones) this.scene.remove(d.mesh);
      for (const c of seg.coins) c.alive = false;
      const dead = (o) => o.s < s - CFG.pruneBehind;
      this.obstacles = this.obstacles.filter((o) => !dead(o));
      this.drones = this.drones.filter((d) => !dead(d));
      this.ramps = this.ramps.filter((r) => r.s1 > s - CFG.pruneBehind);
      this.rails = this.rails.filter((r) => r.s1 > s - CFG.pruneBehind);
      this.pads = this.pads.filter((p) => p.s1 > s - CFG.pruneBehind);
      this.coins = this.coins.filter((c) => c.alive);
      this.idxCoins();
    }
  }

  /* -------------------------------------------------------------- tick */
  update(dt, playerS, time) {
    this.ensureAhead(playerS);
    this.prune(playerS);

    // route chevrons streaming toward the player
    this.routeTex.offset.x -= dt * 2.2;
    if (this.routeTex.offset.x < -1) this.routeTex.offset.x += 1;

    // coins
    const d = this.coinDummy;
    const live = this.liveCoins || [];
    const n = Math.min(live.length, MAX_COINS);
    for (let i = 0; i < n; i++) {
      const c = live[i];
      d.position.set(c.px, c.py + Math.sin(time * 2.4 + c.phase) * 0.22, c.pz);
      d.rotation.set(0, time * 2.2 + c.phase, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.coinMesh.setMatrixAt(i, d.matrix);
    }
    for (let i = n; i < MAX_COINS; i++) {
      d.position.set(0, -9999, 0);
      d.scale.setScalar(0.0001);
      d.updateMatrix();
      this.coinMesh.setMatrixAt(i, d.matrix);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;

    // drones patrol
    for (const dr of this.drones) {
      const target = dr.baseX + Math.sin(time * dr.speed + dr.phase) * dr.amp;
      dr.curX = target;
      const f = this.path.frameAt(dr.s);
      dr.mesh.position.set(f.x + f.rx * target, f.y + 1.6 + Math.sin(time * 3 + dr.phase) * 0.15, f.z + f.rz * target);
      dr.mesh.rotation.y = f.yaw + Math.sin(time * 2 + dr.phase) * 0.25;
      dr.x = target;
    }

    // pads pulse handled by material opacity
    this.mats.pad.opacity = 0.55 + 0.3 * Math.sin(time * 6);

    this.sky.position.set(this.camPos ? this.camPos.x : 0, 0, this.camPos ? this.camPos.z : 0);
    this.stars.position.copy(this.sky.position);
    this.sunSprite.position.copy(this.sky.position).addScaledVector(this.sunDir, 2300);
    this.ground.position.x = this.camPos ? this.camPos.x : 0;
    this.ground.position.z = this.camPos ? this.camPos.z : 0;
  }

  /** deck height (world y) at a lateral offset */
  deckY(frame, x) {
    return frame.y + x * frame.bank;
  }

  /** first ramp overlapping (s, x) */
  rampAt(s, x) {
    for (const r of this.ramps) {
      if (s >= r.s0 && s <= r.s1 && Math.abs(x - r.x) < r.w * 0.5 + 0.4) return r;
    }
    return null;
  }

  railAt(s, x) {
    for (const r of this.rails) {
      if (s >= r.s0 && s <= r.s1 && Math.abs(x - r.x) < 0.9) return r;
    }
    return null;
  }

  padAt(s, x) {
    for (const p of this.pads) {
      if (s >= p.s0 && s <= p.s1 && Math.abs(x - p.x) < 2.6) return p;
    }
    return null;
  }

  coinNear(s, x, h) {
    let best = null;
    for (const c of this.coins) {
      if (!c.alive) continue;
      if (Math.abs(c.s - s) < 2.0 && Math.abs(c.x - x) < 1.9 && Math.abs(c.h - h) < 2.3) { best = c; break; }
    }
    return best;
  }

  takeCoin(c) {
    c.alive = false;
    this.coins = this.coins.filter((o) => o !== c);
    this.idxCoins();
  }

  upcomingTurn(s, look = 70) {
    const segs = this.path.segs;
    let i = this.path.segIndexAt(s);
    if (i < 0) return null;
    while (i < segs.length && segs[i].s1 < s) i++;
    for (; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.s0 > s + look) return null;
      if (seg.type === 'turn' && seg.s1 > s + 2) return seg;
    }
    return null;
  }

  currentSeg(s) { return this.path.segAt(s); }

  distanceLeftInSeg(s) {
    const seg = this.path.segAt(s);
    return seg ? seg.s1 - s : 0;
  }
}

export { clamp };
