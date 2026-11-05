import * as THREE from 'three';

// Misty golden-hour valley. The same sky shader draws the dome and feeds the PBR environment map.
export const SKY = {
  zenith: new THREE.Color('#5f8088'),
  horizon: new THREE.Color('#cdd3b4'),
  ground: new THREE.Color('#58593a'),
  sunDir: new THREE.Vector3(-0.55, 0.36, -0.75).normalize(),
  sunColor: new THREE.Color('#ffd9a0'),
};

const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
  gl_Position.z = gl_Position.w; // always at far plane
}`;

const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
uniform float uTime;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0., 1.), 0.55));
  col = mix(col, uGround, smoothstep(0., -0.25, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.);
  // warm halo and a soft disc
  col += uSunColor * (pow(sd, 6.) * 0.35 + pow(sd, 48.) * 0.7 + smoothstep(0.9985, 0.9995, sd) * 6.0);
  // high, layered cloud veil
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.25) * 1.3;
    float c = fbm(uv * 1.2 + uTime * 0.004) ;
    float c2 = fbm(uv * 3.0 - uTime * 0.006 + 7.);
    float cloud = smoothstep(0.42, 0.85, c * 0.75 + c2 * 0.35) * smoothstep(0.0, 0.25, h);
    vec3 cc = mix(uHorizon * 0.95, vec3(1.0, 0.93, 0.82), pow(sd, 3.) + 0.2);
    col = mix(col, cc, cloud * 0.55);
  }
  // mist band at the horizon
  col = mix(col, uHorizon, exp(-abs(h) * 9.) * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith }, uHorizon: { value: SKY.horizon }, uGround: { value: SKY.ground },
      uSunDir: { value: SKY.sunDir }, uSunColor: { value: SKY.sunColor }, uTime: { value: 0 },
    },
  });
}

export function buildSky() {
  const mat = makeSkyMaterial();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

/** Render the sky into a PMREM so every PBR material receives matching ambient light & reflections. */
export function buildEnvironment(renderer) {
  const scene = new THREE.Scene();
  const mat = makeSkyMaterial();
  mat.depthTest = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
  scene.add(mesh);
  // a few warm bounce cards so shadows are not cold
  const gen = new THREE.PMREMGenerator(renderer);
  const rt = gen.fromScene(scene, 0.0, 0.1, 100);
  gen.dispose();
  return rt.texture;
}
