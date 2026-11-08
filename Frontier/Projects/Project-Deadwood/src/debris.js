import * as T from 'three';
import { groundY } from './course.js';
import { DebrisSimulation, EruptionEmitter } from './debris-simulation.js';

export function buildDebris(scene, floor = groundY) {
  const simulation = new DebrisSimulation(2401,2400,floor), emitter = new EruptionEmitter(simulation);
  const rocks = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0),
    new T.MeshStandardMaterial({ color: 0x827866, roughness: 1, flatShading: true }), 500);
  rocks.instanceMatrix.setUsage(T.DynamicDrawUsage); rocks.frustumCulled = false; rocks.count = 0;
  rocks.castShadow = true; scene.add(rocks);
  const geometry = new T.BufferGeometry(), capacity = simulation.capacity;
  const positions = new Float32Array(capacity * 3), sizes = new Float32Array(capacity), alphas = new Float32Array(capacity), kinds = new Float32Array(capacity);
  for (const [name, array, size] of [['position', positions, 3], ['aSize', sizes, 1], ['aAlpha', alphas, 1], ['aKind', kinds, 1]])
    geometry.setAttribute(name, new T.BufferAttribute(array, size).setUsage(T.DynamicDrawUsage));
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { pixelScale: { value: 600 }, fogColor: { value: scene.fog.color }, fogNear: { value: 95 }, fogFar: { value: 460 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aKind;
      uniform float pixelScale; varying float vAlpha; varying float vKind; varying float vDepth;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(aSize*pixelScale/max(1.0,-mv.z),1.0,110.0);
        vAlpha=aAlpha;vKind=aKind;vDepth=-mv.z; }`,
    fragmentShader: `uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying float vAlpha; varying float vKind; varying float vDepth;
      void main(){ vec2 p=gl_PointCoord*2.0-1.0; float r=length(p); if(r>1.0)discard;
        float grain=.8+.2*sin(p.x*31.0+p.y*47.0)*sin(p.y*23.0);
        float soft=mix(1.0-smoothstep(.55,1.0,r),pow(1.0-r,1.7),vKind);
        vec3 color=mix(vec3(.61,.55,.42),vec3(.56,.52,.43),vKind);
        color=mix(color,fogColor,smoothstep(fogNear,fogFar,vDepth));
        gl_FragColor=vec4(color,vAlpha*soft*grain);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const points = new T.Points(geometry, material); points.frustumCulled = false; scene.add(points);
  const matrix = new T.Matrix4(), quaternion = new T.Quaternion(), euler = new T.Euler(), position = new T.Vector3(), scale = new T.Vector3();
  function render() {
    let rockCount = 0, pointCount = 0;
    for (const p of simulation.particles) {
      if (!p.alive) continue;
      if (p.kind === 'rock') {
        if (rockCount >= 500) continue;
        position.set(p.x, p.y, p.z); quaternion.setFromEuler(euler.set(p.rotation, p.rotation * .7, p.rotation * .3));
        const s = p.size * Math.min(1, p.alpha * 2); scale.set(s, s * .7, s * 1.2);
        matrix.compose(position, quaternion, scale); rocks.setMatrixAt(rockCount++, matrix);
      } else {
        const i = pointCount++;
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        sizes[i] = p.size * (p.kind === 'dust' ? 1 + p.age * .8 : 1); alphas[i] = p.alpha; kinds[i] = p.kind === 'dust' ? 1 : 0;
      }
    }
    rocks.count = rockCount; rocks.instanceMatrix.needsUpdate = true;
    geometry.setDrawRange(0, pointCount); Object.values(geometry.attributes).forEach(a => a.needsUpdate = true);
    material.uniforms.pixelScale.value = innerHeight * Math.min(devicePixelRatio, 1.7);
    material.uniforms.fogNear.value = scene.fog.near; material.uniforms.fogFar.value = scene.fog.far;
  }
  return { simulation, emitter, render, clear: () => { emitter.clear(); render(); } };
}
