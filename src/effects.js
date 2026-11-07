import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------- particles */
const P = 1400;

export class Particles {
  constructor(scene) {
    this.positions = new Float32Array(P * 3);
    this.colors = new Float32Array(P * 3);
    this.sizes = new Float32Array(P);
    this.alphas = new Float32Array(P);
    this.vel = new Float32Array(P * 3);
    this.life = new Float32Array(P);
    this.maxLife = new Float32Array(P);
    this.drag = new Float32Array(P);
    this.grav = new Float32Array(P);
    this.cursor = 0;

    for (let i = 0; i < P; i++) this.positions[i * 3 + 1] = -9999;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 420.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = 1.0 - smoothstep(0.0, 0.5, r);
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, drag = 2.2, grav = 6) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % P;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.sizes[i] = size;
    this.alphas[i] = 1;
    this.colors[i * 3] = color[0];
    this.colors[i * 3 + 1] = color[1];
    this.colors[i * 3 + 2] = color[2];
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  burst(pos, count, opts = {}) {
    const speed = opts.speed ?? 8;
    const life = opts.life ?? 0.6;
    const size = opts.size ?? 0.5;
    const color = opts.color || [0.4, 1.6, 2.2];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = Math.random() * Math.PI;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.spawn(
        pos.x + (Math.random() - 0.5) * (opts.spread ?? 0.6),
        pos.y + (Math.random() - 0.5) * (opts.spread ?? 0.6),
        pos.z + (Math.random() - 0.5) * (opts.spread ?? 0.6),
        Math.sin(a) * Math.sin(p) * s + (opts.vx ?? 0),
        Math.cos(p) * s * 0.8 + (opts.vy ?? 0),
        Math.cos(a) * Math.sin(p) * s + (opts.vz ?? 0),
        life * (0.6 + Math.random() * 0.8),
        size * (0.6 + Math.random() * 0.9),
        color,
        opts.drag ?? 2.4,
        opts.grav ?? 8
      );
    }
  }

  update(dt) {
    const pos = this.positions, vel = this.vel, life = this.life, alpha = this.alphas;
    for (let i = 0; i < P; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      const f = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= f;
      vel[i * 3 + 1] = vel[i * 3 + 1] * f - this.grav[i] * dt;
      vel[i * 3 + 2] *= f;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = Math.max(0, life[i] / this.maxLife[i]);
      alpha[i] = t * t;
      if (pos[i * 3 + 1] < -80) life[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

/* ----------------------------------------------------------------- post */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uFlash: { value: 0 },
    uAberr: { value: 0.0016 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBoost: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uSpeed, uFlash, uAberr, uBoost;
    uniform vec2 uRes;
    varying vec2 vUv;

    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float amt = (uSpeed * 0.055) + uBoost * 0.03;

      vec3 col = vec3(0.0);
      float wsum = 0.0;
      for (int i = 0; i < 6; i++) {
        float f = float(i) / 5.0;
        float w = 1.0 - f * 0.5;
        col += texture2D(tDiffuse, uv - d * amt * f).rgb * w;
        wsum += w;
      }
      col /= wsum;

      float ca = uAberr * (0.5 + uSpeed * 1.4 + uBoost * 0.8);
      col.r = mix(col.r, texture2D(tDiffuse, uv - d * ca * 2.0).r, 0.85);
      col.b = mix(col.b, texture2D(tDiffuse, uv + d * ca * 2.0).b, 0.85);

      float scan = 0.988 + 0.012 * sin(uv.y * uRes.y * 1.35 + uTime * 7.0);
      col *= scan;

      float vig = 1.0 - smoothstep(0.24, 1.05, length(d) * 1.35);
      col *= mix(0.55, 1.0, vig);

      col += vec3(0.55, 0.02, 0.08) * uFlash * (0.25 + 0.75 * (1.0 - smoothstep(0.0, 0.8, length(d))));
      col += vec3(0.05, 0.22, 0.30) * uBoost * smoothstep(0.35, 0.85, length(d)) * 0.5;

      float n = fract(sin(dot(uv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.018;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.broken = false;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.6));
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.95, 0.72, 0.48);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uRes.value.set(size.x, size.y);
    this.output = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);

    this.time = 0;
    this.flash = 0;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  update(dt, speedN, boosting) {
    this.time += dt;
    this.grade.uniforms.uTime.value = this.time;
    this.grade.uniforms.uSpeed.value = speedN;
    this.grade.uniforms.uBoost.value = boosting ? 1 : 0;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.grade.uniforms.uFlash.value = this.flash;
    this.bloom.strength = 0.9 + speedN * 0.25 + (boosting ? 0.25 : 0);
  }

  pulse(amount) { this.flash = Math.min(1.2, this.flash + amount); }

  render() {
    if (this.broken) { this.renderer.render(this.scene, this.camera); return; }
    try {
      this.composer.render();
    } catch (e) {
      // never leave the player with a black screen if post-processing misbehaves
      console.error('post-processing failed, falling back to direct render', e);
      this.broken = true;
      this.renderer.render(this.scene, this.camera);
    }
  }
}
