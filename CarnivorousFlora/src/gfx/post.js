import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Colour grade, vignette, grain, damage / swallowed treatment. Runs in linear HDR before tone mapping.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uDamage: { value: 0 }, uCaught: { value: 0 }, uAspect: { value: 1 }, uGrain: { value: 0.035 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uDamage, uCaught, uAspect, uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r = length(c * vec2(uAspect, 1.0));
      // chromatic fringe grows towards the edges and when swallowed
      float ca = (0.0006 + uCaught * 0.006 + uDamage * 0.003) * r * r * 6.0;
      vec2 dir = normalize(c + 1e-5);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir * ca).b;
      // soft split-tone: warm highlights, teal-green shadows
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.92, 1.02, 0.98), smoothstep(0.35, 0.0, l));
      col = mix(col, col * vec3(1.06, 1.0, 0.9), smoothstep(0.4, 1.4, l));
      // vignette
      float v = smoothstep(0.95, 0.25, r);
      col *= mix(0.55, 1.0, v);
      // damage + swallowed tint
      col = mix(col, col * vec3(1.6, 0.3, 0.25), uDamage * smoothstep(0.2, 0.9, r) * 0.9);
      col = mix(col, vec3(l) * vec3(1.0, 0.45, 0.25) * 0.6, uCaught * 0.35);
      col *= 1.0 - uCaught * smoothstep(0.1, 0.8, r) * 0.7;
      col += (h(vUv * 900.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createComposer(renderer, scene, camera, { bloom = true } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let bloomPass = null;
  if (bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.65, 0.88);
    composer.addPass(bloomPass);
  }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, grade, bloomPass };
}
