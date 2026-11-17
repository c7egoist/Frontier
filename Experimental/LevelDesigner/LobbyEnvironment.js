// The Lobby's neutral studio on the GPU: a gradient sky dome, a curved cyclorama (floor → cove → wall with a soft
// wavy top, as in the reference photo), a glossy floor with a planar reflection, the sun, hemisphere fill, authored
// lights and an environment map baked from the same sky and studio (so paint and glass reflect the room).
// Everything here is a surface, a sprite or a light; there are no line helpers.
import { THREE } from '../Shared/Studio/Render.js';
import { glowSprite, beam, markDebug } from '../Shared/Studio/Visuals.js';
import { sunDirection } from './LevelDocument.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------------------- sky dome
const SKY_VERTEX = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const SKY_FRAGMENT = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.42, h), 0.7)) : mix(uHorizon, uGround, smoothstep(0.0, 0.08, -h));
    float s = max(dot(normalize(vDir), uSunDir), 0.0);
    col += uSunColor * pow(s, 10.0) * 0.08;   // a soft bloom toward the sun, no disc (the photo's sun is off frame)
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() } },
    vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.lobbySky = true;
  return markDebug(mesh);
}

// ------------------------------------------------------------------------------------------------------ cyclorama
// Swept profile: from the floor at radius (R − cove) a quarter circle rises into a vertical wall at radius R, whose
// top follows a slow wave. The arc wraps the back of the stage (away from the hero view) and leaves the front open.
export function cycloramaGeometry({ radius = 13, height = 5.2, wave = 1.6, cove = 2.2, wall = '#e9ecf0', floor = '#d4dae2' }, { centre = 232, span = 250 } = {}) {
  const segs = 96, coveSteps = 10, wallSteps = 6;
  const c0 = new THREE.Color(floor), c1 = new THREE.Color(wall), c = new THREE.Color();
  const pos = [], col = [], uv = [], idx = [];
  const ring = coveSteps + wallSteps + 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (centre - span / 2 + span * t) * DEG;
    const sx = Math.sin(a), sz = Math.cos(a);
    const top = Math.max(cove + 0.4, height + wave * Math.cos((t - 0.38) * Math.PI * 1.6));
    // the ends of the arc fall off so the wall reads as a sculpted shell, not a cut
    const edge = Math.min(1, Math.min(t, 1 - t) / 0.12);
    const h = cove + 0.2 + (top - cove - 0.2) * (0.35 + 0.65 * Math.sin(edge * Math.PI / 2));
    for (let k = 0; k <= coveSteps; k++) {
      const q = (k / coveSteps) * Math.PI / 2;
      const r = radius - cove + Math.sin(q) * cove, y = cove - Math.cos(q) * cove + 0.001;
      pos.push(sx * r, y, sz * r);
      c.copy(c0).lerp(c1, Math.pow(k / coveSteps, 1.4));
      col.push(c.r, c.g, c.b);
      uv.push(t, y / h);
    }
    for (let k = 1; k <= wallSteps; k++) {
      const y = cove + ((h - cove) * k) / wallSteps;
      pos.push(sx * radius, y, sz * radius);
      col.push(c1.r, c1.g, c1.b);
      uv.push(t, y / h);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < ring - 1; k++) {
    const a = i * ring + k, b = a + ring;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --------------------------------------------------------------------------------------------- planar reflection
// The floor's mirror image, rendered from a reflected camera into a half-float target and laid over the lit floor
// with a blur that follows the gloss, a fresnel lift at grazing angles and a fade toward the walls.
const REFLECT_VERTEX = /* glsl */`
  uniform mat4 uTextureMatrix;
  varying vec4 vProj;
  varying vec3 vWorld;
  void main() {
    vProj = uTextureMatrix * vec4(position, 1.0);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const REFLECT_FRAGMENT = /* glsl */`
  uniform sampler2D uReflection;
  uniform float uStrength;
  uniform float uBlur;
  uniform float uFade;
  uniform vec2 uTexel;
  varying vec4 vProj;
  varying vec3 vWorld;
  void main() {
    vec2 uv = vProj.xy / vProj.w;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
      float w = exp(-float(x * x + y * y) * 0.35);
      acc += texture2D(uReflection, uv + vec2(float(x), float(y)) * uTexel * uBlur).rgb * w;
      wsum += w;
    }
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = 0.35 + 0.65 * pow(1.0 - max(viewDir.y, 0.0), 3.0);
    float fade = 1.0 - smoothstep(uFade * 0.45, uFade, length(vWorld.xz));
    gl_FragColor = vec4(acc / wsum, uStrength * fresnel * fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

class FloorMirror {
  constructor(size = 160) {
    this.target = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
    this.virtual = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.hidden = [];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uReflection: { value: this.target.texture }, uTextureMatrix: { value: this.textureMatrix }, uStrength: { value: 0.5 }, uBlur: { value: 1.5 }, uFade: { value: 13 }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) } },
      vertexShader: REFLECT_VERTEX, fragmentShader: REFLECT_FRAGMENT, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.0015;
    this.mesh.renderOrder = -2;
    markDebug(this.mesh);
    this.mesh.onBeforeRender = (renderer, scene, camera) => this.render(renderer, scene, camera);
    this.busy = false;
  }

  resize(w, h) {
    const tw = Math.max(64, Math.round(w / 2)), th = Math.max(64, Math.round(h / 2));
    if (this.target.width === tw && this.target.height === th) return;
    this.target.setSize(tw, th);
    this.mesh.material.uniforms.uTexel.value.set(1 / tw, 1 / th);
  }

  // Reflected camera across the plane y = 0 with an oblique near plane, so nothing below the floor leaks in.
  render(renderer, scene, camera) {
    if (this.busy || !camera.isPerspectiveCamera || camera.position.y <= 0.002) return;
    this.busy = true;
    const v = this.virtual;
    v.copy(camera, false);
    v.position.set(camera.position.x, -camera.position.y, camera.position.z);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const look = camera.position.clone().add(forward);
    look.y = -look.y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    v.up.set(up.x, -up.y, up.z);
    v.lookAt(look);
    v.updateMatrixWorld(true);
    v.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse).multiply(this.mesh.matrixWorld);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(v.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = v.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - 0.003; p[14] = clip.w;
    const was = this.hidden.map((o) => o.visible);
    this.hidden.forEach((o) => { o.visible = false; });
    this.mesh.visible = false;
    const rt = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, v);
    renderer.setRenderTarget(rt);
    renderer.shadowMap.autoUpdate = shadows;
    this.mesh.visible = true;
    this.hidden.forEach((o, i) => { o.visible = was[i]; });
    this.busy = false;
  }
}

// ------------------------------------------------------------------------------------------------- the environment
export class LobbyEnvironment {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    this.group = new THREE.Group();
    this.group.name = 'LobbyEnvironment';
    scene.add(this.group);
    scene.background = null;
    scene.fog = new THREE.Fog('#dce9f5', 34, 120);
    stage.ground.visible = false;          // the floor itself receives the shadows
    stage.grid.visible = false;            // the studio is the ground; G brings the dot floor back
    // Stage lights: its sun becomes the Lobby sun; the hemisphere and the cool fill take the sky colours.
    this.hemi = scene.children.find((o) => o.isHemisphereLight);
    this.fill = scene.children.find((o) => o.isDirectionalLight && o !== stage.sun);
    this.sun = stage.sun;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.02;
    const cam = this.sun.shadow.camera;
    cam.left = -9; cam.right = 9; cam.top = 9; cam.bottom = -9; cam.near = 0.5; cam.far = 60;
    cam.updateProjectionMatrix();

    this.sky = skyDome();
    this.wallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    this.wall = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial);
    this.wall.receiveShadow = true;
    this.wall.castShadow = false;
    this.wall.raycast = () => {};
    this.floorMaterial = new THREE.MeshPhysicalMaterial({ color: '#d4dae2', roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(160, 96), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.raycast = () => {};
    this.mirror = new FloorMirror();
    this.mirror.hidden = [stage.overlay, this.floor];
    this.lights = new THREE.Group();
    this.lights.name = 'LobbyLights';
    this.group.add(this.sky, this.wall, this.floor, this.mirror.mesh, this.lights);
    this.lightObjects = new Map();
    this.pmrem = new THREE.PMREMGenerator(stage.renderer);
    this.envTarget = null;
    this.envKey = '';
    this.envTimer = 0;
    this.designVisuals = true;
    stage.frameCallbacks.add(() => {
      const size = stage.renderer.getSize(new THREE.Vector2());
      this.mirror.resize(size.x, size.y);
    });
  }

  // Applies a level environment. Cheap fields update in place; the cyclorama and the environment map rebuild only
  // when their inputs change (the map is debounced while a slider is dragged).
  apply(env, role = 'premium') {
    const { sky, sun, studio } = env;
    const u = this.sky.material.uniforms;
    u.uTop.value.set(sky.top); u.uHorizon.value.set(sky.horizon); u.uGround.value.set(sky.ground);
    const dir = new THREE.Vector3(...sunDirection(sun));
    u.uSunDir.value.copy(dir);
    u.uSunColor.value.set(sun.color).multiplyScalar(Math.min(1, sun.intensity / 3) * Math.max(0, Math.sign(sun.elevation + 2)));
    this.stage.scene.fog.color.set(sky.horizon);
    this.stage.renderer.toneMappingExposure = 1.05 * sky.exposure;
    this.sun.color.set(sun.color);
    this.sun.intensity = sun.elevation > -2 ? sun.intensity : 0;
    this.sun.position.copy(dir).multiplyScalar(24);
    this.sun.target.position.set(0, 0, 0);
    this.sun.shadow.radius = 1 + sun.softness * 7;
    this.sun.shadow.blurSamples = 16;
    if (this.hemi) { this.hemi.color.set(sky.top).lerp(new THREE.Color('#ffffff'), 0.3); this.hemi.groundColor.set(studio.floor).multiplyScalar(0.55); this.hemi.intensity = 1.1 * studio.fill; }
    if (this.fill) { this.fill.color.set(sky.horizon); this.fill.intensity = 0.45 * studio.fill; this.fill.position.copy(dir).multiplyScalar(-10).setY(4); }
    const wallKey = JSON.stringify(studio);
    if (wallKey !== this.wallKey) {
      this.wallKey = wallKey;
      this.wall.geometry.dispose();
      this.wall.geometry = cycloramaGeometry(studio);
    }
    this.floorMaterial.color.set(studio.floor);
    this.floorMaterial.roughness = 0.75 - studio.gloss * 0.55;
    this.floorMaterial.clearcoat = studio.gloss;
    this.floorMaterial.clearcoatRoughness = 0.35 - studio.gloss * 0.3;
    const m = this.mirror.mesh.material.uniforms;
    m.uStrength.value = 0.62 * studio.gloss;
    m.uBlur.value = 0.6 + (1 - studio.gloss) * 4;
    m.uFade.value = studio.radius * 1.05;
    this.applyLights(env.lights, role);
    const key = JSON.stringify([sky, sun.color, sun.azimuth, sun.elevation, studio.wall, studio.floor]);
    if (key !== this.envKey) {
      this.envKey = key;
      clearTimeout(this.envTimer);
      if (!this.envTarget) this.bakeEnvironment(env);
      else this.envTimer = setTimeout(() => this.bakeEnvironment(env), 180);
    }
  }

  // Environment map: the sky dome, a ring of wall colour and an overhead softbox strip, prefiltered by PMREM.
  bakeEnvironment(env) {
    const scene = new THREE.Scene();
    const dome = skyDome();
    Object.entries(this.sky.material.uniforms).forEach(([k, v]) => { dome.material.uniforms[k].value = v.value.clone ? v.value.clone() : v.value; });
    scene.add(dome);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 5, 48, 1, true, (env.studio ? 140 : 0) * DEG, 260 * DEG), new THREE.MeshBasicMaterial({ color: env.studio.wall, side: THREE.BackSide }));
    wall.position.y = 2.5;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: env.studio.floor }));
    floor.rotation.x = -Math.PI / 2;
    const box = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(3.2), side: THREE.DoubleSide }));
    box.position.set(0, 6, 0); box.rotation.x = Math.PI / 2;
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(env.sun.color).multiplyScalar(2 + env.sun.intensity) }));
    sunDisc.position.copy(new THREE.Vector3(...sunDirection(env.sun)).multiplyScalar(60));
    scene.add(wall, floor, box, sunDisc);
    try {
      const target = this.pmrem.fromScene(scene, 0.03, 0.1, 200);
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = target;
      this.stage.scene.environment = target.texture;
      this.stage.scene.environmentIntensity = 0.85;
    } catch (error) {
      console.warn('Lobby environment map', error);
    }
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  // Authored lights: three.js lights plus their design visuals (a glow core, a beam for spots, a lit panel for area
  // lights). Each light root carries userData.componentId so the Designer picks and moves it like an entity.
  applyLights(list, role) {
    const keep = new Set();
    for (const l of list) {
      keep.add(l.id);
      const key = `${l.type}|${l.color}|${l.angle}|${l.range}|${l.width}|${l.height}`;
      let rec = this.lightObjects.get(l.id);
      if (!rec || rec.key !== key) {
        if (rec) this.lights.remove(rec.root);
        rec = { key, root: buildLight(l) };
        this.lightObjects.set(l.id, rec);
        this.lights.add(rec.root);
      }
      const { root } = rec;
      root.position.fromArray(l.transform.location);
      root.rotation.set(l.transform.rotation[0] * DEG, l.transform.rotation[1] * DEG, l.transform.rotation[2] * DEG);
      root.visible = l.visible !== false && (l.layer !== 'premium' || role === 'premium');
      root.userData.light.intensity = l.type === 'point' ? l.intensity : l.type === 'area' ? l.intensity * 14 : l.intensity;
      root.userData.visual.visible = this.designVisuals;
    }
    for (const [id, rec] of this.lightObjects) if (!keep.has(id)) { this.lights.remove(rec.root); this.lightObjects.delete(id); }
  }

  showDesignVisuals(on) {
    this.designVisuals = on;
    for (const rec of this.lightObjects.values()) rec.root.userData.visual.visible = on;
  }
}

function buildLight(l) {
  const root = new THREE.Group();
  root.userData.componentId = l.id;
  const visual = new THREE.Group();
  let light;
  if (l.type === 'point') {
    light = new THREE.PointLight(l.color, l.intensity, l.range, 2);
    visual.add(glowSprite(l.color, 0.9, 0.8));
  } else {
    // spot and area lights shine along +X; an area light is a soft, wide spot with a glowing panel
    const area = l.type === 'area';
    light = new THREE.SpotLight(l.color, l.intensity, l.range, (area ? 70 : l.angle) * DEG, area ? 1 : 0.35, 2);
    light.position.set(0, 0, 0);
    light.target.position.set(1, 0, 0);
    root.add(light.target);
    if (area) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(l.width, l.height), new THREE.MeshBasicMaterial({ color: new THREE.Color(l.color).multiplyScalar(1.4), side: THREE.DoubleSide, transparent: true, opacity: 0.32, depthWrite: false }));
      panel.rotation.y = Math.PI / 2;     // the panel faces +X
      markDebug(panel);
      visual.add(panel);
    } else {
      visual.add(beam({ length: Math.min(4, l.range * 0.25), radius: Math.tan(l.angle * DEG) * Math.min(4, l.range * 0.25), color: l.color, strength: 0.22 }));
      visual.add(glowSprite(l.color, 0.7, 0.8));
    }
  }
  light.castShadow = false;
  root.add(light, visual);
  // invisible pick volume (debug visuals are not pickable)
  const pick = new THREE.Mesh(new THREE.SphereGeometry(l.type === 'area' ? Math.max(l.width, l.height) * 0.4 : 0.35, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  pick.userData.pickOnly = true;
  root.add(pick);
  root.userData.light = light;
  root.userData.visual = visual;
  return root;
}
