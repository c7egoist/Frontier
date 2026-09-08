/* ════════════════════════════════════════════════════════════════════════════════════════════
   VIEWPORT
   A small real-time scene so the outliner has something true to drive: an analytic sky with a
   sun disc and a phased moon, a star sphere, a drifting cloud deck, a Gerstner ocean, lit
   geometry, and light/camera/effect proxies. Every entity registers a world-space ANCHOR; the
   billboard layer projects those anchors to screen space, which is how the user picks things.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { flat, reflatten, typeOf, effectiveVis } from './world.js';

const D2R = Math.PI / 180;
const col = hex => new THREE.Color(hex);
const dirFrom = (elevDeg, azimDeg) => {
  const e = elevDeg * D2R, a = azimDeg * D2R;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
};

/* ── shaders ───────────────────────────────────────────────────────────────────────────────── */
const SKY_VERT = /* glsl */`
  varying vec3 vWorld;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uGround, uSunTint, uMoonTint;
  uniform float uRayleigh, uMie, uMieG, uTurbidity, uOzone, uIntensity;
  uniform float uSunAngular, uSunIntensity, uMoonAngular, uMoonPhase, uMoonBright, uEarthshine;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
  }

  void main(){
    vec3 dir = normalize(vWorld - cameraPosition);
    float y = dir.y;
    float day = smoothstep(-0.10, 0.24, uSunDir.y);

    float h = pow(clamp(1.0 - max(y,0.0), 0.0, 1.0), 2.4 / max(uRayleigh, 0.25));
    vec3 dayCol   = mix(uZenith, uHorizon, h);
    vec3 nightCol = mix(vec3(0.010,0.014,0.030), vec3(0.030,0.042,0.075), h);
    vec3 c = mix(nightCol, dayCol, day);

    float sunDot = clamp(dot(dir, uSunDir), 0.0, 1.0);
    float twilight = exp(-pow(abs(uSunDir.y) * 5.5, 2.0));
    c += vec3(1.0,0.45,0.18) * pow(sunDot, 6.0) * twilight * (0.35 + uTurbidity * 0.06);
    c += vec3(1.0,0.30,0.12) * pow(clamp(1.0-abs(y)*3.2,0.0,1.0), 3.0) * twilight * 0.22;

    float g = clamp(uMieG, 0.0, 0.95);
    float hg = (1.0-g*g) / pow(max(1.0 + g*g - 2.0*g*sunDot, 1e-3), 1.5);
    c += uSunTint * uMie * hg * 0.05 * max(day, 0.04);

    c *= mix(vec3(1.0), vec3(0.85,0.93,1.08), uOzone * 0.45 * day);
    c = mix(c, uGround * (0.25 + 0.75*day), smoothstep(0.0, -0.05, y));

    // sun disc + bloom-feeding glow
    float sunAng = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
    float sr = max(radians(uSunAngular) * 0.5, 0.0015);
    float disc = 1.0 - smoothstep(sr*0.88, sr*1.18, sunAng);
    c += uSunTint * disc * (1.6 + uSunIntensity * 0.045);
    c += uSunTint * exp(-sunAng * 26.0) * 0.30 * max(day, 0.08);

    // moon: analytic phase, soft terminator, a little surface mottling
    float mr = max(radians(uMoonAngular) * 0.5, 0.0015);
    float moonAng = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
    if(moonAng < mr * 2.6 && uMoonBright > 0.001){
      vec3 mx = normalize(cross(vec3(0.0,1.0,0.0), uMoonDir) + vec3(1e-5));
      vec3 my = normalize(cross(uMoonDir, mx));
      vec2 p = vec2(dot(dir, mx), dot(dir, my)) / mr;
      float r2 = dot(p,p);
      if(r2 <= 1.0){
        float z = sqrt(max(0.0, 1.0 - r2));
        float th = (1.0 - clamp(uMoonPhase,0.0,1.0)) * 3.14159265;
        vec3 n = vec3(p.x, p.y, z);
        vec3 L = vec3(sin(th), 0.0, cos(th));
        float lit = smoothstep(-0.06, 0.12, dot(n, L));
        float mott = 0.80 + 0.20 * noise(p * 6.0 + 3.0);
        float limb = 0.55 + 0.45 * z;
        c = mix(c, uMoonTint * (lit * mott * limb + uEarthshine) * uMoonBright,
                clamp((1.0 - smoothstep(0.92, 1.0, sqrt(r2))), 0.0, 1.0));
      }
      c += uMoonTint * exp(-moonAng / max(mr,1e-4) * 1.4) * 0.05 * uMoonBright;
    }

    gl_FragColor = vec4(max(c,0.0) * uIntensity, 1.0);
  }`;

const STAR_VERT = /* glsl */`
  attribute float aSize; attribute float aSeed; attribute vec3 aColor;
  varying vec3 vColor; varying float vTw;
  uniform float uTime, uSize, uTwinkle, uPixelRatio;
  void main(){
    vColor = aColor;
    float tw = 1.0 - uTwinkle * 0.55 * (0.5 + 0.5*sin(uTime*2.4 + aSeed*63.7));
    vTw = tw;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uSize * uPixelRatio * tw;
  }`;

const STAR_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vColor; varying float vTw;
  uniform float uBright, uVisible;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float a = smoothstep(0.5, 0.06, r);
    a *= a;
    float spike = max(0.0, 1.0 - abs(d.x)*14.0) * max(0.0, 1.0 - abs(d.y)*3.0)
                + max(0.0, 1.0 - abs(d.y)*14.0) * max(0.0, 1.0 - abs(d.x)*3.0);
    a = clamp(a + spike * 0.30, 0.0, 1.0);
    float alpha = a * uBright * uVisible * vTw;
    if(alpha < 0.004) discard;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }`;

const CLOUD_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vWorld;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const CLOUD_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vWorld;
  uniform float uTime, uCoverage, uDensity, uScale, uDetail, uSpeed, uDay;
  uniform vec2 uWind;
  uniform vec3 uTint, uShade, uSunDir, uSunTint;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<6;i++){ v += a*noise(p); p = p*2.03 + 17.3; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = (vUv - 0.5) * 26.0 / max(uScale, 0.05);
    vec2 drift = uWind * uTime * uSpeed * 0.03;
    float base = fbm(uv + drift);
    float det  = fbm(uv * 3.1 - drift * 1.7);
    float f = mix(base, det, uDetail * 0.45);
    float cov = mix(0.92, 0.18, clamp(uCoverage,0.0,1.0));
    float a = smoothstep(cov, cov + 0.22, f) * clamp(uDensity,0.0,1.0);

    // horizon fade so the deck reads as sky, not as a lid
    float d = length(vWorld.xz);
    a *= 1.0 - smoothstep(900.0, 2200.0, d);
    a *= smoothstep(0.0, 240.0, d);
    if(a < 0.004) discard;

    float lift = smoothstep(cov, cov + 0.45, f);
    vec3 c = mix(uShade, uTint, lift);
    c = mix(c * (0.20 + 0.25*uDay), c, uDay);
    c += uSunTint * pow(clamp(dot(normalize(vec3(uv.x,6.0,uv.y)), uSunDir),0.0,1.0), 8.0) * 0.35 * uDay;
    gl_FragColor = vec4(c, a * 0.92);
  }`;

const WATER_VERT = /* glsl */`
  uniform float uTime, uAmp, uLen, uChop, uSpeed;
  uniform vec2 uWind;
  varying vec3 vWorld; varying vec3 vNormal2; varying float vCrest;

  void wave(vec2 dir, float len, float amp, float speed, vec2 p, inout float h, inout vec2 slope){
    float k = 6.28318 / max(len, 0.2);
    float f = k * dot(dir, p) - uTime * speed * k;
    h += amp * sin(f);
    slope += dir * (amp * k * cos(f));
  }
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    vec2 w = normalize(uWind + vec2(1e-4));
    vec2 w2 = normalize(vec2(w.y, -w.x) * 0.6 + w);
    float h = 0.0; vec2 slope = vec2(0.0);
    wave(w,  uLen,        uAmp,        1.10*uSpeed, p, h, slope);
    wave(w2, uLen*0.63,   uAmp*0.55,   1.42*uSpeed, p, h, slope);
    wave(normalize(w + vec2(-0.7,0.4)), uLen*0.31, uAmp*0.30*uChop, 1.9*uSpeed, p, h, slope);
    wave(normalize(w + vec2(0.5,-0.8)), uLen*0.14, uAmp*0.14*uChop, 2.6*uSpeed, p, h, slope);
    // ripple detail keeps the far field from going glassy
    h += sin(p.x*1.7 + uTime*1.3)*sin(p.y*1.4 - uTime*1.1) * uAmp * 0.06 * uChop;

    wp.y += h;
    vWorld = wp.xyz;
    vCrest = clamp(h / max(uAmp, 1e-3), -1.0, 1.0);
    vNormal2 = normalize(vec3(-slope.x, 1.0, -slope.y));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const WATER_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld; varying vec3 vNormal2; varying float vCrest;
  uniform vec3 uDeep, uShallow, uSunDir, uSunTint, uSkyZenith, uSkyHorizon, uFogColor;
  uniform float uReflect, uRough, uFoam, uSpec, uClarity, uDay, uFogDensity, uTime;

  void main(){
    vec3 n = normalize(vNormal2);
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
    fres = mix(0.03, 1.0, fres) * uReflect;

    float upness = clamp(dot(reflect(-v, n), vec3(0.0,1.0,0.0)), 0.0, 1.0);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, upness);
    vec3 body = mix(uDeep, uShallow, clamp(uClarity * (0.35 + 0.65*upness), 0.0, 1.0));
    body *= (0.16 + 0.84 * uDay);

    vec3 c = mix(body, sky * (0.25 + 0.75*uDay), fres);

    vec3 hv = normalize(uSunDir + v);
    float shine = pow(clamp(dot(n, hv), 0.0, 1.0), mix(2000.0, 40.0, clamp(uRough,0.0,1.0)));
    c += uSunTint * shine * uSpec * max(uDay, 0.05) * 2.2;
    // glitter path towards the sun
    c += uSunTint * pow(clamp(dot(n, normalize(uSunDir + vec3(0.0,0.2,0.0))),0.0,1.0), 60.0) * 0.25 * uDay;

    float foam = smoothstep(0.62, 0.98, vCrest) * uFoam;
    c = mix(c, vec3(0.92,0.95,0.98) * (0.3 + 0.7*uDay), foam);

    float dist = length(vWorld - cameraPosition);
    float fogAmt = 1.0 - exp(-uFogDensity * dist * 1.4);
    c = mix(c, uFogColor * (0.25 + 0.75*uDay), clamp(fogAmt, 0.0, 0.92));

    gl_FragColor = vec4(c, 1.0);
  }`;

const PART_VERT = /* glsl */`
  attribute float aSeed;
  uniform float uTime, uSize, uSpeed, uRadius, uHeight, uPixelRatio, uFlicker, uDay;
  varying float vA;
  void main(){
    float s = aSeed;
    float ang = s * 6.28318 * 7.0;
    float rad = uRadius * (0.15 + 0.85 * fract(s * 13.13));
    float t = fract(s * 7.77 + uTime * 0.05 * uSpeed * (0.4 + fract(s*3.3)));
    vec3 p = vec3(cos(ang + uTime*0.12*uSpeed) * rad,
                  t * uHeight + sin(uTime*0.9 + s*20.0) * 0.15,
                  sin(ang + uTime*0.1*uSpeed) * rad);
    vA = (0.35 + 0.65 * abs(sin(uTime * (1.4 + fract(s*5.0)*2.6) + s*40.0))) ;
    vA = mix(1.0, vA, uFlicker) * smoothstep(0.0,0.12,t) * (1.0 - smoothstep(0.7,1.0,t));
    vA *= mix(1.0, 0.10, clamp(uDay, 0.0, 1.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (60.0 / max(-mv.z, 1.0));
  }`;

const PART_FRAG = /* glsl */`
  precision highp float;
  varying float vA;
  uniform vec3 uColor;
  void main(){
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r) * vA;
    if(a < 0.01) discard;
    gl_FragColor = vec4(uColor * a * 1.6, a);
  }`;

/* ── viewport ──────────────────────────────────────────────────────────────────────────────── */
export function createViewport(canvas, { onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene3 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 6000);
  camera.position.set(11.5, 5.4, 13.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 2.5;
  controls.maxDistance = 260;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 1.1, 0);

  /* ── sky dome ── */
  const skyUniforms = {
    uSunDir: { value: new THREE.Vector3(0, 0.3, 1) },
    uMoonDir: { value: new THREE.Vector3(0, 0.6, -1) },
    uZenith: { value: col('#2f6dd0') }, uHorizon: { value: col('#9fc4e8') }, uGround: { value: col('#14181d') },
    uSunTint: { value: col('#fff0d4') }, uMoonTint: { value: col('#d8e2f2') },
    uRayleigh: { value: 1.35 }, uMie: { value: 0.22 }, uMieG: { value: 0.78 },
    uTurbidity: { value: 3.4 }, uOzone: { value: 1 }, uIntensity: { value: 1 },
    uSunAngular: { value: 0.6 }, uSunIntensity: { value: 88 },
    uMoonAngular: { value: 1.6 }, uMoonPhase: { value: 0.68 }, uMoonBright: { value: 1.1 }, uEarthshine: { value: 0.16 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 48, 32),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false }),
  );
  sky.frustumCulled = false;
  scene3.add(sky);

  /* ── stars ── */
  const STAR_N = 5200;
  const starGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(STAR_N * 3), size = new Float32Array(STAR_N),
      seed = new Float32Array(STAR_N), cbuf = new Float32Array(STAR_N * 3);
    const warm = col('#ffd7ae'), cool = col('#bcd4ff');
    for (let i = 0; i < STAR_N; i++) {
      // half the field is scattered on a galactic band so the sphere is not uniform mush
      let v;
      if (i % 2 === 0) {
        const t = Math.random() * Math.PI * 2;
        const band = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
        v = new THREE.Vector3(Math.cos(t), band * 1.6, Math.sin(t))
          .applyAxisAngle(new THREE.Vector3(1, 0, 0.35).normalize(), 0.9).normalize();
      } else {
        v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.lengthSq() < 1e-4) v.set(0, 1, 0);
        v.normalize();
      }
      /* the field is a dome, not a sphere — anything under the horizon would float on the ocean */
      v.y = Math.abs(v.y) * 0.92 + 0.03;
      v.normalize().multiplyScalar(2400);
      pos.set([v.x, v.y, v.z], i * 3);
      const m = Math.pow(Math.random(), 3.2);
      size[i] = 0.6 + m * 4.2;
      seed[i] = Math.random();
      const c = warm.clone().lerp(cool, Math.random());
      cbuf.set([c.r, c.g, c.b], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(cbuf, 3));
  }
  const starUniforms = {
    uTime: { value: 0 }, uSize: { value: 1.5 }, uTwinkle: { value: 0.45 },
    uBright: { value: 1.15 }, uVisible: { value: 1 }, uPixelRatio: { value: renderer.getPixelRatio() },
  };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  scene3.add(stars);

  /* ── clouds ── */
  const cloudUniforms = {
    uTime: { value: 0 }, uCoverage: { value: 0.46 }, uDensity: { value: 0.62 }, uScale: { value: 1 },
    uDetail: { value: 0.55 }, uSpeed: { value: 1 }, uDay: { value: 1 },
    uWind: { value: new THREE.Vector2(0.6, 0.4) },
    uTint: { value: col('#eef3f8') }, uShade: { value: col('#5c6a7c') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunTint: { value: col('#fff0d4') },
  };
  const clouds = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000, 1, 1),
    new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, uniforms: cloudUniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = 130;
  clouds.renderOrder = 1;
  scene3.add(clouds);

  /* ── water ── */
  const waterUniforms = {
    uTime: { value: 0 }, uAmp: { value: 0.19 }, uLen: { value: 7.5 }, uChop: { value: 0.85 }, uSpeed: { value: 1 },
    uWind: { value: new THREE.Vector2(0.6, 0.4) },
    uDeep: { value: col('#06222e') }, uShallow: { value: col('#1d7b8c') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunTint: { value: col('#fff0d4') },
    uSkyZenith: { value: col('#2f6dd0') }, uSkyHorizon: { value: col('#9fc4e8') },
    uFogColor: { value: col('#8fa4bb') },
    uReflect: { value: 0.82 }, uRough: { value: 0.07 }, uFoam: { value: 0.28 }, uSpec: { value: 1.6 },
    uClarity: { value: 0.55 }, uDay: { value: 1 }, uFogDensity: { value: 0.011 },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400, 220, 220),
    new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: waterUniforms }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  scene3.add(water);

  /* ── lights driven by the sun / moon / sky nodes ── */
  const sunLight = new THREE.DirectionalLight(0xfff0d4, 3);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 0.5; sc.far = 120;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.03;
  scene3.add(sunLight, sunLight.target);

  const moonLight = new THREE.DirectionalLight(0xaec4e8, 0.2);
  scene3.add(moonLight, moonLight.target);

  const hemi = new THREE.HemisphereLight(0x9fc4e8, 0x14181d, 0.7);
  scene3.add(hemi);
  const fogObj = new THREE.FogExp2(0x8fa4bb, 0.011);

  /* Image-based lighting: the sky shader is rendered into a small PMREM cube so metals reflect the
     actual sky that is on screen. Regenerated on a debounce, never per frame. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  let envRT = null, envDirty = true, envClock = 0;
  function refreshEnvironment() {
    const prev = envRT;
    envRT = pmrem.fromScene(envScene, 0, 1, 4000);
    scene3.environment = envRT.texture;
    scene3.environmentIntensity = 1.0;
    if (prev) prev.dispose();
  }

  /* ── node → object registry ── */
  const objects = new Map();   // node.id → { root, mesh?, light?, helper?, anchor(vec3) }
  let selectedIds = new Set();  // helpers (frustums, probe bounds, audio rings) follow the selection
  const anchors = new Map();   // node.id → THREE.Vector3 (world space)
  const pickables = [];        // meshes eligible for raycast picking

  const GEO = {
    box: () => new THREE.BoxGeometry(1, 1, 1),
    sphere: () => new THREE.SphereGeometry(0.6, 48, 32),
    torus: () => new THREE.TorusGeometry(0.7, 0.22, 24, 72),
    cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
    plane: () => new THREE.PlaneGeometry(2, 2, 1, 1),
  };

  function ringGizmo(radius, color, segments = 64) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
  }

  function build(node) {
    const t = typeOf(node);
    const root = new THREE.Group();
    const entry = { root, node };
    root.userData.nodeId = node.id;

    if (t.mesh) {
      const mat = new THREE.MeshStandardMaterial({ color: col(node.props.color) });
      const mesh = new THREE.Mesh(GEO[t.mesh](), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.nodeId = node.id;
      root.add(mesh);
      entry.mesh = mesh;
      pickables.push(mesh);
    } else if (node.type === 'pointlight') {
      const light = new THREE.PointLight(col(node.props.color), 14, 26, 2);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12),
        new THREE.MeshBasicMaterial({ color: col(node.props.color) }));
      root.add(light, glow);
      entry.light = light; entry.glow = glow;
    } else if (node.type === 'spotlight') {
      const light = new THREE.SpotLight(col(node.props.color), 60, 0, 0.45, 0.4, 1.6);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      const target = new THREE.Object3D();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1, 1, 40, 1, true),
        new THREE.MeshBasicMaterial({ color: col(node.props.color), transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }),
      );
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.ConeGeometry(1, 1, 4, 1, true)),
        new THREE.LineBasicMaterial({ color: col(node.props.color), transparent: true, opacity: 0.18 }),
      );
      scene3.add(target);
      light.target = target;
      root.add(light, cone, wire);
      entry.light = light; entry.target = target; entry.cone = cone; entry.wire = wire;
    } else if (node.type === 'camera') {
      const cam = new THREE.PerspectiveCamera(node.props.fov, 16 / 9, 0.4, 9);
      const helper = new THREE.CameraHelper(cam);
      helper.material.opacity = 0.22;
      helper.material.transparent = true;
      entry.proxy = cam; entry.helper = helper;
      scene3.add(helper);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.45, metalness: 0.3, emissive: 0x0a0d10 }));
      body.castShadow = false;
      root.add(body);
      entry.mesh = body;
    } else if (node.type === 'particles') {
      const n = 4000;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) { seed[i] = Math.random(); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const uni = {
        uTime: { value: 0 }, uSize: { value: 2.1 }, uSpeed: { value: 0.5 }, uRadius: { value: 9 },
        uHeight: { value: 5 }, uPixelRatio: { value: renderer.getPixelRatio() }, uFlicker: { value: 0.7 },
        uDay: { value: 1 },
        uColor: { value: col('#ffd88a') },
      };
      const pts = new THREE.Points(g, new THREE.ShaderMaterial({
        vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: uni,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      pts.frustumCulled = false;
      root.add(pts);
      entry.points = pts; entry.uni = uni;
    } else if (node.type === 'probe') {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0x7de0ff, wireframe: true, transparent: true, opacity: 0.16 }));
      root.add(sphere);
      entry.bounds = sphere;
    } else if (node.type === 'audio') {
      const ring = ringGizmo(1, 0xb78dff);
      root.add(ring);
      entry.ring = ring;
    }

    scene3.add(root);
    objects.set(node.id, entry);
    return entry;
  }

  /* ── property application ──────────────────────────────────────────────────────────────── */
  const nodeOf = type => flat.find(n => n.type === type);
  const P = type => (nodeOf(type)?.props) || {};

  let sunDir = new THREE.Vector3(0, 0.4, 1);
  let moonDir = new THREE.Vector3(0, 0.7, -1);
  let dayFactor = 1;

  function applyEnvironment() {
    const skyN = nodeOf('sky'), sunN = nodeOf('sun'), moonN = nodeOf('moon'),
      starN = nodeOf('stars'), cloudN = nodeOf('clouds'), fogN = nodeOf('fog'),
      windN = nodeOf('wind'), waterN = nodeOf('water');

    const s = sunN.props, m = moonN.props, k = skyN.props;
    sunDir = dirFrom(s.elevation, s.azimuth);
    moonDir = dirFrom(m.elevation, m.azimuth);
    dayFactor = THREE.MathUtils.clamp((sunDir.y + 0.10) / 0.34, 0, 1);

    const sunOn = sunN.vis && effectiveVis(sunN);
    const moonOn = moonN.vis && effectiveVis(moonN);

    /* sky */
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uMoonDir.value.copy(moonDir);
    skyUniforms.uRayleigh.value = k.rayleigh;
    skyUniforms.uMie.value = k.mie;
    skyUniforms.uMieG.value = k.mieG;
    skyUniforms.uTurbidity.value = k.turbidity;
    skyUniforms.uOzone.value = k.ozone;
    skyUniforms.uIntensity.value = (skyN.vis && effectiveVis(skyN)) ? k.intensity : 0.02;
    skyUniforms.uZenith.value.set(k.zenith);
    skyUniforms.uHorizon.value.set(k.horizon);
    skyUniforms.uGround.value.set(k.ground);
    skyUniforms.uSunTint.value.set(s.tint);
    skyUniforms.uSunAngular.value = sunOn ? s.angular : 0;
    skyUniforms.uSunIntensity.value = sunOn ? s.intensity : 0;
    skyUniforms.uMoonTint.value.set(m.tint);
    skyUniforms.uMoonAngular.value = m.angular;
    skyUniforms.uMoonPhase.value = m.phase;
    skyUniforms.uMoonBright.value = moonOn ? m.brightness : 0;
    skyUniforms.uEarthshine.value = m.earthshine;

    /* stars */
    const st = starN.props;
    starUniforms.uSize.value = st.size;
    starUniforms.uTwinkle.value = st.twinkle;
    starUniforms.uBright.value = st.brightness;
    starUniforms.uVisible.value = (starN.vis && effectiveVis(starN)) ? Math.pow(1 - dayFactor, 2.2) : 0;
    stars.rotation.y = st.rotation * D2R;
    stars.geometry.setDrawRange(0, Math.floor(STAR_N * THREE.MathUtils.clamp(st.density * 1.4, 0.02, 1)));
    stars.visible = starN.vis && effectiveVis(starN);

    /* wind, shared by clouds / water / trees-of-the-future */
    const w = windN.props;
    const wv = new THREE.Vector2(Math.sin(w.direction * D2R), Math.cos(w.direction * D2R))
      .multiplyScalar(Math.max(w.speed, 0.05) * 0.25);

    /* clouds */
    const c = cloudN.props;
    cloudUniforms.uCoverage.value = c.coverage;
    cloudUniforms.uDensity.value = c.density;
    cloudUniforms.uScale.value = c.scale;
    cloudUniforms.uDetail.value = c.detail;
    cloudUniforms.uSpeed.value = c.speed;
    cloudUniforms.uTint.value.set(c.tint);
    cloudUniforms.uShade.value.set(c.shade);
    cloudUniforms.uSunDir.value.copy(sunDir);
    cloudUniforms.uSunTint.value.set(s.tint);
    cloudUniforms.uWind.value.copy(c.windLinked ? wv : new THREE.Vector2(0.6, 0.4));
    clouds.position.y = c.altitude;
    clouds.visible = cloudN.vis && effectiveVis(cloudN);

    /* fog */
    const f = fogN.props;
    const fogOn = f.enabled && fogN.vis && effectiveVis(fogN);
    if (fogOn) {
      fogObj.color.set(f.color).multiplyScalar(0.25 + 0.75 * dayFactor);
      fogObj.density = f.density;
      scene3.fog = fogObj;
    } else scene3.fog = null;
    waterUniforms.uFogDensity.value = fogOn ? f.density : 0;
    waterUniforms.uFogColor.value.set(f.color);

    /* water */
    const wa = waterN.props;
    waterUniforms.uAmp.value = wa.amplitude;
    waterUniforms.uLen.value = wa.wavelength;
    waterUniforms.uChop.value = wa.choppiness;
    waterUniforms.uSpeed.value = wa.speed;
    waterUniforms.uDeep.value.set(wa.deep);
    waterUniforms.uShallow.value.set(wa.shallow);
    waterUniforms.uReflect.value = wa.reflectivity;
    waterUniforms.uRough.value = wa.roughness;
    waterUniforms.uFoam.value = wa.foam;
    waterUniforms.uSpec.value = wa.specular;
    waterUniforms.uClarity.value = wa.clarity;
    waterUniforms.uSunDir.value.copy(sunDir);
    waterUniforms.uSunTint.value.set(s.tint);
    waterUniforms.uSkyZenith.value.set(k.zenith);
    waterUniforms.uSkyHorizon.value.set(k.horizon);
    waterUniforms.uWind.value.copy(wa.windLinked ? wv : new THREE.Vector2(1, 0));
    water.position.y = wa.level;
    water.visible = waterN.vis && effectiveVis(waterN);
    if (Math.abs(water.scale.x - wa.extent / 1400) > 1e-3) water.scale.setScalar(wa.extent / 1400);

    /* sun & moon lights */
    const kelvinTint = kelvin(s.temperature);
    sunLight.color.set(s.tint).multiply(kelvinTint);
    sunLight.intensity = sunOn ? (s.intensity / 30) * Math.max(dayFactor, 0.0) : 0;
    sunLight.castShadow = !!s.shadows && sunOn;
    sunLight.shadow.radius = s.softness;
    sunLight.position.copy(sunDir).multiplyScalar(60);
    sunLight.target.position.set(0, 0, 0);

    moonLight.color.set(m.tint);
    moonLight.intensity = moonOn ? m.moonlight * (1 - dayFactor) * 0.9 : 0;
    moonLight.position.copy(moonDir).multiplyScalar(60);

    hemi.color.set(k.horizon);
    hemi.groundColor.set(k.ground);
    hemi.intensity = (skyN.vis && k.lightsScene ? 1 : 0.05) * k.intensity * (0.16 + 0.66 * dayFactor);

    /* post */
    const postN = nodeOf('post');
    if (postN) {
      const p = postN.props;
      const on = postN.vis && effectiveVis(postN);
      renderer.toneMappingExposure = on ? p.exposure : 1;
      renderer.toneMapping = on ? (TONEMAP[p.tonemap] ?? THREE.ACESFilmicToneMapping) : THREE.ACESFilmicToneMapping;
      bloomPass.enabled = on && p.bloom;
      bloomPass.strength = p.bloomStrength;
      bloomPass.threshold = p.bloomThreshold;
      vignetteEl && vignetteEl.style.setProperty('--vig', on ? p.vignette : 0);
      grainEl && grainEl.style.setProperty('--grain', on ? p.grain * 0.16 : 0);
      saturation = on ? p.saturation : 1;
      contrast = on ? p.contrast : 1;
    }

    envDirty = true;

    /* anchors for the environment billboards */
    anchors.set(nodeOf('sun').id, sunDir.clone().multiplyScalar(1500));
    anchors.set(nodeOf('moon').id, moonDir.clone().multiplyScalar(1500));
    anchors.set(nodeOf('sky').id, dirFrom(38, (s.azimuth + 90) % 360).multiplyScalar(900));
    anchors.set(nodeOf('stars').id, dirFrom(62, (s.azimuth + 200) % 360).multiplyScalar(1200));
    anchors.set(nodeOf('clouds').id, new THREE.Vector3(0, c.altitude, 0).add(dirFrom(0, (w.direction + 180) % 360).multiplyScalar(180)));
    anchors.set(nodeOf('fog').id, new THREE.Vector3(-11, wa.level + 1.6, 9));
    anchors.set(nodeOf('water').id, new THREE.Vector3(9, wa.level + 0.35, 9));
  }

  const TONEMAP = {
    ACES: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Filmic: THREE.CineonToneMapping,
    Reinhard: THREE.ReinhardToneMapping, Linear: THREE.LinearToneMapping,
  };
  /* very small black-body approximation, enough to tint the key light believably */
  function kelvin(k) {
    const t = THREE.MathUtils.clamp((k - 1600) / (12000 - 1600), 0, 1);
    return new THREE.Color().setRGB(
      THREE.MathUtils.lerp(1.0, 0.72, t), THREE.MathUtils.lerp(0.62, 0.84, t), THREE.MathUtils.lerp(0.30, 1.0, t),
    );
  }

  function applyNode(node) {
    const t = typeOf(node);
    if (['sky', 'sun', 'moon', 'stars', 'clouds', 'fog', 'wind', 'water', 'post'].includes(node.type)) {
      applyEnvironment();
      return;
    }
    const e = objects.get(node.id) || build(node);
    const p = node.props;
    const visible = node.vis && effectiveVis(node);
    e.root.visible = visible;

    if (t.mesh && e.mesh) {
      e.root.position.set(...p.pos);
      e.root.rotation.set(p.rot[0] * D2R, p.rot[1] * D2R, p.rot[2] * D2R);
      e.root.scale.set(...p.scale.map(v => Math.max(v, 0.001)));
      const mat = e.mesh.material;
      mat.color.set(p.color);
      mat.metalness = p.metalness;
      mat.roughness = Math.max(p.roughness, 0.02);
      mat.emissive.set(p.emissive);
      mat.emissiveIntensity = p.emissiveStrength;
      e.mesh.castShadow = p.castShadow;
      anchors.set(node.id, new THREE.Vector3(p.pos[0], p.pos[1] + Math.abs(p.scale[1]) * 0.62 + 0.35, p.pos[2]));
    } else if (node.type === 'pointlight') {
      e.root.position.set(...p.pos);
      e.light.color.set(p.color);
      e.light.intensity = visible ? p.intensity : 0;
      e.light.distance = p.distance;
      e.light.decay = p.decay;
      e.light.castShadow = p.shadows;
      e.glow.material.color.set(p.color);
      e.glow.visible = p.gizmoGlow && visible;
      anchors.set(node.id, new THREE.Vector3(...p.pos));
    } else if (node.type === 'spotlight') {
      e.root.position.set(...p.pos);
      e.target.position.set(...p.target);
      e.light.color.set(p.color);
      e.light.intensity = visible ? p.intensity : 0;
      e.light.angle = p.angle * D2R;
      e.light.penumbra = p.penumbra;
      e.light.castShadow = p.shadows;
      /* cone gizmo aimed down the light axis */
      const from = new THREE.Vector3(...p.pos), to = new THREE.Vector3(...p.target);
      const len = Math.max(from.distanceTo(to), 0.2);
      const rad = Math.tan(p.angle * D2R) * len;
      [e.cone, e.wire].forEach(g => {
        /* the wire cone is always available as a hint; the volume only shows for the selected light */
        g.visible = p.showCone && visible && (g === e.wire || selectedIds.has(node.id));
        g.scale.set(rad, len, rad);
        g.position.set(0, 0, 0);
        const mid = to.clone().sub(from).multiplyScalar(0.5);
        g.position.copy(mid);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
        g.material.color.set(p.color);
      });
      anchors.set(node.id, new THREE.Vector3(...p.pos));
    } else if (node.type === 'camera') {
      e.root.position.set(...p.pos);
      e.root.lookAt(new THREE.Vector3(...p.lookAt));
      e.proxy.position.set(...p.pos);
      e.proxy.lookAt(new THREE.Vector3(...p.lookAt));
      e.proxy.fov = p.fov;
      e.proxy.aspect = ({ '16:9': 16 / 9, '2.39:1': 2.39, '4:3': 4 / 3, '1:1': 1 })[p.gate] || 16 / 9;
      e.proxy.far = THREE.MathUtils.clamp(p.focus * 0.4, 1.6, 4.5);
      e.proxy.updateProjectionMatrix();
      e.proxy.updateMatrixWorld(true);
      e.helper.update();
      e.helper.visible = p.showFrustum && visible && selectedIds.has(node.id);
      anchors.set(node.id, new THREE.Vector3(p.pos[0], p.pos[1] + 0.35, p.pos[2]));
    } else if (node.type === 'particles') {
      e.root.position.set(...p.pos);
      e.uni.uSize.value = p.size;
      e.uni.uSpeed.value = p.speed;
      e.uni.uRadius.value = p.radius;
      e.uni.uHeight.value = p.height;
      e.uni.uFlicker.value = p.flicker;
      e.uni.uColor.value.set(p.color);
      e.points.geometry.setDrawRange(0, Math.floor(p.count));
      anchors.set(node.id, new THREE.Vector3(p.pos[0], p.pos[1] + p.height * 0.5, p.pos[2]));
    } else if (node.type === 'probe') {
      e.root.position.set(...p.pos);
      e.bounds.scale.setScalar(p.radius);
      e.bounds.visible = p.showBounds && visible && selectedIds.has(node.id);
      e.bounds.material.opacity = 0.06 + 0.12 * p.intensity;
      anchors.set(node.id, new THREE.Vector3(...p.pos));
    } else if (node.type === 'audio') {
      e.root.position.set(...p.pos);
      e.ring.scale.setScalar(p.radius);
      e.ring.material.opacity = 0.12 + 0.3 * p.gain;
      e.ring.visible = visible && selectedIds.has(node.id);
      anchors.set(node.id, new THREE.Vector3(...p.pos));
    }
  }

  function applyAll() {
    reflatten();
    applyEnvironment();
    flat.forEach(n => { if (n.type !== 'folder') applyNode(n); });
  }

  /* ── post chain ── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene3, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.6, 0.85);
  composer.addPass(bloomPass);
  const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene3, camera);
  outlinePass.edgeStrength = 4.0;
  outlinePass.edgeGlow = 0.35;
  outlinePass.edgeThickness = 1.2;
  outlinePass.pulsePeriod = 0;
  outlinePass.visibleEdgeColor.set('#ffffff');
  outlinePass.hiddenEdgeColor.set('#3a3a3a');
  composer.addPass(outlinePass);
  const gradePass = makeGradePass();
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
  let saturation = 1, contrast = 1;
  let vignetteEl = null, grainEl = null;

  function makeGradePass() {
    const shader = {
      uniforms: { tDiffuse: { value: null }, uSat: { value: 1 }, uCon: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uSat, uCon; varying vec2 vUv;
        void main(){
          vec4 t = texture2D(tDiffuse, vUv);
          float l = dot(t.rgb, vec3(0.2126,0.7152,0.0722));
          vec3 c = mix(vec3(l), t.rgb, uSat);
          c = (c - 0.5) * uCon + 0.5;
          gl_FragColor = vec4(max(c, 0.0), t.a);
        }`,
    };
    return new ShaderPass(shader);
  }

  /* ── picking ─────────────────────────────────────────────────────────────────────────────── */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.6);
  function pickAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables.filter(m => m.visible && m.parent?.visible), false);
    if (hits.length) return hits[0].object.userData.nodeId;
    if (water.visible) {
      waterPlane.constant = -water.position.y;
      const hit = ray.ray.intersectPlane(waterPlane, new THREE.Vector3());
      if (hit && hit.distanceTo(camera.position) < 900) return nodeOf('water').id;
    }
    return null;
  }
  canvas.addEventListener('pointerdown', () => canvas.classList.add('dragging'));
  addEventListener('pointerup', () => canvas.classList.remove('dragging'));
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (moved < 4 && performance.now() - downAt.t < 500 && onPick) onPick(pickAt(e.clientX, e.clientY), e);
    downAt = null;
  });

  /* ── selection highlight ── */
  function setSelection(ids) {
    const before = selectedIds;
    selectedIds = new Set(ids);
    /* re-apply anything whose gizmo visibility depends on selection */
    flat.forEach(n => {
      if (!['camera', 'probe', 'audio', 'spotlight'].includes(n.type)) return;
      if (before.has(n.id) !== selectedIds.has(n.id)) applyNode(n);
    });
    const sel = [];
    ids.forEach(id => {
      const e = objects.get(id);
      if (e?.mesh) sel.push(e.mesh);
      if (e?.bounds) sel.push(e.bounds);
    });
    outlinePass.selectedObjects = sel;
  }

  /* ── framing ── */
  let flight = null;
  function focusOn(node) {
    const a = anchors.get(node.id);
    if (!a) return;
    const far = a.length() > 400;              // sun, moon, sky, stars: celestial, you look up, not at
    if (far) {
      /* the camera stays where it is and the view pitches up to the body, the way an eye would.
         The polar clamp has to open up for that, otherwise the controls fight the tilt. */
      controls.maxPolarAngle = Math.PI;
      const from = camera.position.clone();
      const target = from.clone().add(a.clone().normalize().multiplyScalar(60));
      flight = { t: 0, fromT: controls.target.clone(), toT: target, fromP: from, toP: from };
      return;
    }
    controls.maxPolarAngle = Math.PI * 0.495;
    const dist = Math.max(3.2, a.distanceTo(controls.target) * 0.35 + 4.2);
    const dir = camera.position.clone().sub(controls.target).setLength(dist);
    flight = { t: 0, fromT: controls.target.clone(), toT: a.clone(), fromP: camera.position.clone(), toP: a.clone().add(dir) };
  }
  function frameAll() {
    controls.maxPolarAngle = Math.PI * 0.495;
    flight = {
      t: 0, fromT: controls.target.clone(), toT: new THREE.Vector3(0, 1.1, 0),
      fromP: camera.position.clone(), toP: new THREE.Vector3(11.5, 5.4, 13.5),
    };
  }

  /* ── resize / loop ── */
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    outlinePass.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    starUniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let time = 0, fps = 60, acc = 0, frames = 0;

  function tick(dt) {
    time += dt;
    const starN = nodeOf('stars');
    stars.rotation.y += dt * 0.0015 * (starN.props.drift || 0);

    skyUniforms && (sky.position.copy(camera.position));
    stars.position.copy(camera.position);
    starUniforms.uTime.value = time;
    cloudUniforms.uTime.value = time;
    cloudUniforms.uDay.value = dayFactor;
    waterUniforms.uTime.value = time;
    waterUniforms.uDay.value = dayFactor;
    clouds.position.x = camera.position.x;
    clouds.position.z = camera.position.z;
    objects.forEach(e => { if (e.uni) { e.uni.uTime.value = time; e.uni.uDay.value = dayFactor; } });

    envClock += dt;
    if (envDirty && envClock > 0.25) { envDirty = false; envClock = 0; refreshEnvironment(); }

    if (flight) {
      flight.t = Math.min(1, flight.t + dt * 2.1);
      const k = 1 - Math.pow(1 - flight.t, 3);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      camera.position.lerpVectors(flight.fromP, flight.toP, k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    gradePass.uniforms.uSat.value = saturation;
    gradePass.uniforms.uCon.value = contrast;
    composer.render();
  }

  let onEnvTick = null;
  let raf = 0;
  function start(onFrame) {
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.06);
      tick(dt);
      frames++; acc += dt;
      if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0; }
      onFrame && onFrame({ fps, time, dayFactor, camera, controls });
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }

  return {
    scene3, camera, controls, renderer, anchors, objects,
    applyNode, applyAll, setSelection, focusOn, frameAll, start, resize, pickAt,
    get dayFactor() { return dayFactor; },
    get sunDir() { return sunDir; },
    setHudElements(v, g) { vignetteEl = v; grainEl = g; },
    onEnvTick: fn => { onEnvTick = fn; },
    remove(node) {
      const e = objects.get(node.id);
      if (!e) return;
      scene3.remove(e.root);
      if (e.helper) scene3.remove(e.helper);
      if (e.target) scene3.remove(e.target);
      if (e.mesh) { const i = pickables.indexOf(e.mesh); if (i >= 0) pickables.splice(i, 1); }
      objects.delete(node.id);
      anchors.delete(node.id);
    },
  };
}
