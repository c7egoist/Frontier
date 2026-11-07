import * as THREE from 'three';
import { GROUND_Y } from './track.js';

// Golden-hour sky: deep blue zenith, peach horizon, a big low sun. The fog
// matches the horizon so the desert floor dissolves into it.
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
    float sd = max(dot(d, uSunDir), 0.0);
    sky += uSunColor * (smoothstep(0.9975, 0.9985, sd) * 1.4 + pow(sd, 10.0) * 0.22 + pow(sd, 2.0) * 0.06);
    vec3 col = mix(uGround, sky, smoothstep(-0.06, 0.0, h));
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createWorld(scene) {
  const horizon = new THREE.Color(0xF2BC93);
  scene.fog = new THREE.Fog(horizon.clone(), 120, 470);
  const sunDir = new THREE.Vector3(0.45, 0.34, 0.82).normalize();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(0x3B6A9A) }, uHorizon: { value: horizon.clone() },
        uGround: { value: new THREE.Color(0xE2A67E) }, uSunDir: { value: sunDir }, uSunColor: { value: new THREE.Color(0xFFE2B0) },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xCFE3F5, 0xC9825E, 0.8));
  const sun = new THREE.DirectionalLight(0xFFE6C2, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 420;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.5;
  scene.add(sun); scene.add(sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0xC98A64, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; ground.receiveShadow = true; scene.add(ground);

  return {
    sunDir,
    update(camPos, focus) {
      sky.position.copy(camPos);
      ground.position.set(camPos.x, GROUND_Y, camPos.z);
      sun.position.copy(focus).addScaledVector(sunDir, 170);
      sun.target.position.copy(focus); sun.target.updateMatrixWorld();
    },
  };
}

function circleTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Dust, smoke and sparks: a small pool of sprites.
export class Fx {
  constructor(scene) {
    const tex = circleTexture(); this.pool = []; this.i = 0;
    for (let i = 0; i < 140; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false; scene.add(sp);
      this.pool.push({ sp, life: 0, max: 1, size: 1, grow: 1, rise: 0, vel: new THREE.Vector3() });
    }
  }
  spawn(pos, color, size, vel, life = 0.7, grow = 2.5, rise = 2) {
    const p = this.pool[this.i++ % this.pool.length];
    p.sp.visible = true; p.sp.position.copy(pos); p.sp.material.color.set(color); p.sp.material.opacity = 0.8;
    p.size = size; p.sp.scale.set(size, size, 1); p.vel.copy(vel); p.life = p.max = life; p.grow = grow; p.rise = rise;
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.sp.visible) continue;
      p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; }
      const t = 1 - p.life / p.max;
      p.sp.position.addScaledVector(p.vel, dt); p.vel.y += p.rise * dt;
      p.sp.material.opacity = 0.75 * (1 - t) * (1 - t);
      const s = p.size * (1 + p.grow * t); p.sp.scale.set(s, s, 1);
    }
  }
}
