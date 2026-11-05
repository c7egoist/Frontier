import * as THREE from 'three';
import { windGLSL, WIND_DIR } from '../util/noise.js';

/** Uniforms shared by every patched material. */
export const Shared = {
  uTime: { value: 0 },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) }, // unit vector towards the sun, view space
  uSunColor: { value: new THREE.Color(1.0, 0.82, 0.6) },
};

/**
 * Adds (a) GPU wind sway driven by the `aSway` attribute (metres of displacement at that vertex)
 * and (b) cheap thin-surface light transmission so petals and leaves glow when backlit.
 */
export function patchFlora(material, { trans = 0.6, transTint = null, wind = true } = {}) {
  const tint = transTint ? new THREE.Color(transTint) : new THREE.Color(1, 1, 1);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTime = Shared.uTime;
    shader.uniforms.uSunDirView = Shared.uSunDirView;
    shader.uniforms.uSunColor = Shared.uSunColor;
    shader.uniforms.uTrans = { value: trans };
    shader.uniforms.uTransTint = { value: tint };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aSway;\nuniform float uTime;\n${windGLSL}`)
      .replace(
        '#include <project_vertex>',
        wind
          ? `vec4 lp = vec4(transformed, 1.0);
             #ifdef USE_INSTANCING
               lp = instanceMatrix * lp;
             #endif
             vec4 wpos = modelMatrix * lp;
             wpos.xz += vec2(${WIND_DIR[0].toFixed(2)}, ${WIND_DIR[1].toFixed(2)}) * aSway * windValue(wpos.xz, uTime);
             vec4 mvPosition = viewMatrix * wpos;
             gl_Position = projectionMatrix * mvPosition;`
          : '#include <project_vertex>'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uSunDirView; uniform vec3 uSunColor; uniform float uTrans; uniform vec3 uTransTint;`)
      .replace(
        '#include <opaque_fragment>',
        `{
           vec3 V = -normalize(vViewPosition);
           float back = pow(clamp(dot(V, normalize(uSunDirView)), 0.0, 1.0), 2.5);
           vec3 glow = diffuseColor.rgb * uTransTint * uSunColor * uTrans * (0.10 + 1.7 * back);
           outgoingLight += glow;
         }
         #include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => `flora_${wind}_${trans}_${transTint || ''}`;
  return material;
}
