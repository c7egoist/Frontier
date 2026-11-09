/*==========================================================================================================================================
                                                            GPUPAINTENGINE.JS
==========================================================================================================================================*/
/* Real-time WebGL2 GPU Texture Painting, Blending, Masking, Edge Dilation & Normal Extraction Engine:
   - Live 3D surface brush + 2D UV brush execute entirely in GPU WebGLRenderTargets (zero JS pixel loops during strokes)
   - Full PBR ORM+Height packing + Height->Normal Sobel extraction + +2px UV gutter dilation on GPU
   - Non-destructive layer stack compositing (Normal, Multiply, Screen, Overlay, Add, Darken, Part filter, Layer Masks)
   - GPU-resident Undo/Redo target snapshots (readPixels runs ONLY on PNG Export or Eyedropper sample). */

import * as THREE from "three";
import { sampleCurveLut, getToolChannels } from "./TexturePaintEngine.js";

function hexToRgb(hex) {
  const s = String(hex || "#ffffff").replace(/^#/, "");
  if (s.length === 3) {
    return [
      parseInt(s[0] + s[0], 16) || 255,
      parseInt(s[1] + s[1], 16) || 255,
      parseInt(s[2] + s[2], 16) || 255,
    ];
  }
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const FULLSCREEN_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BLIT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texelFetch(uSource, ivec2(gl_FragCoord.xy), 0);
}`;

const DAB_COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uPrevAlbedo;
uniform sampler2D uPrevOrmh;
uniform sampler2D uPosPartTex;
uniform sampler2D uNormIslandTex;
uniform sampler2D uStampTex;
uniform int uMode; // 0 = 3D brush, 1 = 2D UV brush
uniform int uTip; // 0=round,1=chisel,2=chalk,3=splatter,4=sponge,5=stamp,6=custom
uniform int uHasStamp;
uniform int uPartFilter;
uniform vec3 uHitPos;
uniform vec3 uHitNormal;
uniform vec3 uBrushRight;
uniform vec3 uBrushUp;
uniform vec2 uStrokeUv;
uniform float uWorldRadius;
uniform float uUvRadius;
uniform float uHardness;
uniform float uFlow;
uniform float uAngle;
uniform float uRoundness;
uniform float uFalloffCurve[17];
uniform vec3 uBrushColor;
uniform float uBrushRough;
uniform float uBrushMetal;
uniform float uBrushHeight;
uniform float uSeed;
uniform int uPassTarget; // 0 = write albedo, 1 = write ormh
in vec2 vUv;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345) + uSeed);
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float sampleFalloff(float x) {
  float cx = clamp(x, 0.0, 1.0) * 16.0;
  int i0 = clamp(int(floor(cx)), 0, 16);
  int i1 = clamp(i0 + 1, 0, 16);
  return mix(uFalloffCurve[i0], uFalloffCurve[i1], fract(cx));
}

float tipCoverage(vec2 local, float distNorm, vec2 noiseCoord, out vec4 stampSample) {
  stampSample = vec4(uBrushColor, 1.0);
  float c = cos(uAngle), s = sin(uAngle);
  vec2 r = vec2(local.x * c + local.y * s, -local.x * s + local.y * c);
  float roundness = clamp(uRoundness, 0.15, 1.0);
  vec2 rq = vec2(r.x, r.y / roundness);

  if (uTip == 5 && uHasStamp != 0) {
    vec2 suv = r * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) return 0.0;
    vec4 st = texture(uStampTex, vec2(suv.x, suv.y));
    stampSample = st;
    return st.a;
  }

  if (uTip == 6 && uHasStamp != 0) {
    vec2 suv = rq * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) return 0.0;
    vec4 st = texture(uStampTex, vec2(suv.x, suv.y));
    float dCustom = length(rq);
    if (dCustom >= 1.0) return 0.0;
    float edgeFade = sampleFalloff(clamp(1.0 - dCustom, 0.0, 1.0));
    stampSample = vec4(uBrushColor, 1.0);
    return clamp(st.a * edgeFade, 0.0, 1.0);
  }

  float d = uMode == 0 && abs(uRoundness - 1.0) < 0.01 && abs(uAngle) < 0.01 ? distNorm : length(rq);
  if (uTip == 1) { // chisel
    d = max(abs(rq.x), abs(rq.y) * 1.4);
  }
  if (d >= 1.0) return 0.0;

  float edge = mix(1.0, 0.02, clamp(uHardness, 0.0, 0.99));
  float t = clamp((1.0 - d) / max(0.02, edge), 0.0, 1.0);
  float alpha = sampleFalloff(t);

  if (uTip == 2) { // chalk
    float n = hash21(floor(noiseCoord * 360.0));
    alpha *= smoothstep(0.2, 0.85, n + (1.0 - d) * 0.35);
  } else if (uTip == 3) { // splatter
    vec2 cell = floor(rq * 5.0 + 10.0);
    float drop = hash21(cell + uSeed * 0.17);
    if (drop < 0.48) alpha = 0.0;
    else alpha *= smoothstep(0.55, 0.08, length(fract(rq * 5.0) - 0.5));
  } else if (uTip == 4) { // sponge
    float n = hash21(floor(noiseCoord * 160.0));
    if (n < 0.36) alpha *= 0.14;
  }
  return clamp(alpha, 0.0, 1.0);
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 prevA = texelFetch(uPrevAlbedo, px, 0);
  vec4 prevO = texelFetch(uPrevOrmh, px, 0);

  vec4 posPart = texelFetch(uPosPartTex, px, 0);
  if (posPart.w < -0.5) {
    fragColor = uPassTarget == 0 ? prevA : prevO;
    return;
  }
  if (uPartFilter >= 0 && int(floor(posPart.w + 0.5)) != uPartFilter) {
    fragColor = uPassTarget == 0 ? prevA : prevO;
    return;
  }

  vec2 local;
  float distNorm;
  if (uMode == 0) {
    vec4 normIsl = texelFetch(uNormIslandTex, px, 0);
    if (dot(normIsl.xyz, uHitNormal) < -0.18) {
      fragColor = uPassTarget == 0 ? prevA : prevO;
      return;
    }
    vec3 delta = posPart.xyz - uHitPos;
    float dWorld = length(delta);
    if (dWorld > uWorldRadius * 1.15) {
      fragColor = uPassTarget == 0 ? prevA : prevO;
      return;
    }
    local = vec2(dot(delta, uBrushRight), dot(delta, uBrushUp)) / max(1e-4, uWorldRadius);
    distNorm = dWorld / max(1e-4, uWorldRadius);
  } else {
    vec2 duv = vUv - uStrokeUv;
    local = duv / max(1e-4, uUvRadius);
    distNorm = length(local);
    if (distNorm > 1.1) {
      fragColor = uPassTarget == 0 ? prevA : prevO;
      return;
    }
  }

  vec4 stSample;
  float dabCov = tipCoverage(local, distNorm, vUv, stSample);
  if (dabCov <= 0.002) {
    fragColor = uPassTarget == 0 ? prevA : prevO;
    return;
  }

  float dabAlpha = clamp(dabCov * uFlow, 0.0, 1.0);
  float nextAlpha = clamp(1.0 - (1.0 - prevA.a) * (1.0 - dabAlpha * 0.72), 0.0, 1.0);
  if (dabCov > 0.92 && uFlow > 0.85) nextAlpha = max(nextAlpha, dabAlpha);

  if (uPassTarget == 0) {
    float blendW = nextAlpha > 1e-4 ? clamp(dabAlpha / max(nextAlpha, dabAlpha), 0.0, 1.0) : 1.0;
    vec3 col = mix(prevA.rgb, stSample.rgb, prevA.a < 0.01 ? 1.0 : blendW);
    fragColor = vec4(col, nextAlpha);
  } else {
    float h01 = clamp(uBrushHeight * 0.5 + 0.5, 0.0, 1.0);
    float blendW = nextAlpha > 1e-4 ? clamp(dabAlpha / max(nextAlpha, dabAlpha), 0.0, 1.0) : 1.0;
    vec3 ormh = mix(prevO.rgb, vec3(uBrushRough, uBrushMetal, h01), prevO.a < 0.01 ? 1.0 : blendW);
    fragColor = vec4(ormh, nextAlpha);
  }
}
`;

const COMMIT_STROKE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uBaseTex;
uniform sampler2D uStrokeTex;
uniform sampler2D uPrevChanAlphaTex;
uniform float uOpacity;
uniform vec4 uChanMask; // (albedo, rough, metal, height)
uniform int uIsErase;
uniform int uIsMask;
uniform int uPassKind; // 0=albedo, 1=ormh, 2=chanAlpha
in vec2 vUv;
out vec4 fragColor;

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 dst = texelFetch(uBaseTex, px, 0);
  vec4 src = texelFetch(uStrokeTex, px, 0);
  float sa = clamp(src.a * uOpacity, 0.0, 1.0);
  if (sa <= 0.001) {
    fragColor = dst;
    return;
  }
  if (uIsMask != 0) {
    float ink = uIsErase != 0 ? 1.0 : 0.0;
    float m = mix(dst.r, ink, sa);
    fragColor = vec4(m, m, m, 1.0);
    return;
  }
  if (uPassKind == 2) {
    if (uIsErase != 0) {
      fragColor = vec4(
        uChanMask.x > 0.5 ? dst.r * (1.0 - sa) : dst.r,
        uChanMask.y > 0.5 ? dst.g * (1.0 - sa) : dst.g,
        uChanMask.z > 0.5 ? dst.b * (1.0 - sa) : dst.b,
        uChanMask.w > 0.5 ? dst.a * (1.0 - sa) : dst.a
      );
    } else {
      fragColor = vec4(
        uChanMask.x > 0.5 ? sa + dst.r * (1.0 - sa) : dst.r,
        uChanMask.y > 0.5 ? sa + dst.g * (1.0 - sa) : dst.g,
        uChanMask.z > 0.5 ? sa + dst.b * (1.0 - sa) : dst.b,
        uChanMask.w > 0.5 ? sa + dst.a * (1.0 - sa) : dst.a
      );
    }
    return;
  }
  if (uIsErase != 0) {
    if (uPassKind == 0 && uChanMask.x > 0.5) {
      fragColor = vec4(dst.rgb, dst.a * (1.0 - sa));
    } else {
      fragColor = dst;
    }
    return;
  }
  vec4 oldCA = texelFetch(uPrevChanAlphaTex, px, 0);
  if (uPassKind == 0) {
    if (uChanMask.x < 0.5) {
      fragColor = dst;
      return;
    }
    float oldA = oldCA.r;
    float outA = sa + oldA * (1.0 - sa);
    vec3 outRgb = outA > 1e-4 ? (src.rgb * sa + dst.rgb * oldA * (1.0 - sa)) / outA : dst.rgb;
    fragColor = vec4(outRgb, outA);
  } else {
    float rVal = dst.r;
    if (uChanMask.y > 0.5) {
      float outR = sa + oldCA.g * (1.0 - sa);
      rVal = outR > 1e-4 ? (src.r * sa + dst.r * oldCA.g * (1.0 - sa)) / outR : dst.r;
    }
    float mVal = dst.g;
    if (uChanMask.z > 0.5) {
      float outM = sa + oldCA.b * (1.0 - sa);
      mVal = outM > 1e-4 ? (src.g * sa + dst.g * oldCA.b * (1.0 - sa)) / outM : dst.g;
    }
    float hVal = dst.b;
    if (uChanMask.w > 0.5) {
      float outH = sa + oldCA.a * (1.0 - sa);
      hVal = outH > 1e-4 ? (src.b * sa + dst.b * oldCA.a * (1.0 - sa)) / outH : dst.b;
    }
    fragColor = vec4(rVal, mVal, hVal, max(dst.a, sa));
  }
}
`;

const COMPOSITE_LAYER_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uAccAlbedo;
uniform sampler2D uAccOrmh;
uniform sampler2D uPosPartTex;
uniform sampler2D uAuxCueTex;
uniform sampler2D uLayerAlbedo;
uniform sampler2D uLayerOrmh;
uniform sampler2D uLayerChanAlpha;
uniform sampler2D uLayerMask;
uniform sampler2D uStrokeAlbedo;
uniform sampler2D uStrokeOrmh;
uniform sampler2D uPatternTex;
uniform int uLayerKind; // 0=paint/decal, 1=fill, 2=material, 3=generator
uniform int uBlendMode; // 0=Normal,1=Multiply,2=Screen,3=Overlay,4=Add,5=Darken
uniform float uOpacity;
uniform int uPartFilter;
uniform int uHasMask;
uniform int uInvertMask;
uniform int uHasLiveStroke;
uniform int uLiveErase;
uniform int uLiveMaskStroke;
uniform float uLiveOpacity;
uniform vec4 uLiveChanMask;
uniform vec4 uLayerChanMask;
uniform int uHasPattern;
uniform float uPatternRepeats;
uniform vec3 uColorA;
uniform float uRoughA;
uniform float uMetalA;
uniform float uHeightA;
uniform float uParamA; // grainScale / threshold
uniform float uParamB; // grainStrength / softness
uniform float uParamC; // noiseMix
uniform int uGenPreset; // 0=edge-wear, 1=crevice-dirt, 2=top-dust
uniform int uOutTarget; // 0 = albedo, 1 = ormh
in vec2 vUv;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 41.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 blendRgb(vec3 b, vec3 s, int mode) {
  if (mode == 1) return b * s;
  if (mode == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (mode == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (mode == 4) return min(vec3(1.0), b + s);
  if (mode == 5) return min(b, s);
  return s;
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 dstA = texelFetch(uAccAlbedo, px, 0);
  vec4 dstO = texelFetch(uAccOrmh, px, 0);

  vec4 posPart = texelFetch(uPosPartTex, px, 0);
  if (uPartFilter >= 0 && int(floor(posPart.w + 0.5)) != uPartFilter) {
    fragColor = uOutTarget == 0 ? dstA : dstO;
    return;
  }

  vec3 srcRgb = uColorA;
  float srcRough = uRoughA;
  float srcMetal = uMetalA;
  float srcHeight = uHeightA;
  vec4 srcChAlpha = vec4(1.0);

  if (uLayerKind == 0) {
    vec4 la = texelFetch(uLayerAlbedo, px, 0);
    vec4 lo = texelFetch(uLayerOrmh, px, 0);
    vec4 ca = texelFetch(uLayerChanAlpha, px, 0);
    srcRgb = la.rgb;
    srcRough = lo.r;
    srcMetal = lo.g;
    srcHeight = lo.b;
    srcChAlpha = ca;
    if (uHasLiveStroke != 0 && uLiveMaskStroke == 0) {
      vec4 stA = texelFetch(uStrokeAlbedo, px, 0);
      vec4 stO = texelFetch(uStrokeOrmh, px, 0);
      float sa = clamp(stA.a * uLiveOpacity, 0.0, 1.0);
      if (sa > 0.001) {
        if (uLiveErase != 0) {
          srcChAlpha *= (1.0 - sa * uLiveChanMask);
        } else {
          if (uLiveChanMask.x > 0.5) {
            float na = sa + srcChAlpha.r * (1.0 - sa);
            if (na > 1e-4) srcRgb = (stA.rgb * sa + srcRgb * srcChAlpha.r * (1.0 - sa)) / na;
            srcChAlpha.r = na;
          }
          if (uLiveChanMask.y > 0.5) {
            float nr = sa + srcChAlpha.g * (1.0 - sa);
            if (nr > 1e-4) srcRough = (stO.r * sa + srcRough * srcChAlpha.g * (1.0 - sa)) / nr;
            srcChAlpha.g = nr;
          }
          if (uLiveChanMask.z > 0.5) {
            float nm = sa + srcChAlpha.b * (1.0 - sa);
            if (nm > 1e-4) srcMetal = (stO.g * sa + srcMetal * srcChAlpha.b * (1.0 - sa)) / nm;
            srcChAlpha.b = nm;
          }
          if (uLiveChanMask.w > 0.5) {
            float nh = sa + srcChAlpha.a * (1.0 - sa);
            if (nh > 1e-4) srcHeight = (stO.b * sa + srcHeight * srcChAlpha.a * (1.0 - sa)) / nh;
            srcChAlpha.a = nh;
          }
        }
      }
    }
  } else if (uLayerKind == 1) {
    if (uHasPattern != 0) {
      vec2 puv = fract(vUv * max(1.0, uPatternRepeats));
      vec4 pt = texture(uPatternTex, puv);
      srcRgb = mix(uColorA, pt.rgb, pt.a);
    }
  } else if (uLayerKind == 2) {
    float n = vnoise(vUv * max(1.0, uParamA)) * 0.65 + vnoise(vUv * max(1.0, uParamA) * 2.7) * 0.35;
    float d = (n - 0.5) * uParamB * 2.0;
    srcRgb = clamp(uColorA + d, 0.0, 1.0);
    srcRough = clamp(uRoughA - d * 0.45, 0.02, 1.0);
    srcHeight = clamp(0.5 + d * 0.35, 0.0, 1.0);
  } else if (uLayerKind == 3) {
    vec4 cue = texelFetch(uAuxCueTex, px, 0);
    float signal = 0.0;
    if (uGenPreset == 0) signal = clamp((cue.g - 0.5) * 2.0, 0.0, 1.0);
    else if (uGenPreset == 1) signal = clamp(1.0 - cue.r, 0.0, 1.0);
    else signal = clamp(cue.b, 0.0, 1.0);
    float n = vnoise(vUv * 12.0) * 0.65 + vnoise(vUv * 29.0) * 0.35;
    signal = clamp(mix(signal, signal * (0.4 + n * 0.9), uParamC), 0.0, 1.0);
    srcChAlpha = vec4(smoothstep(uParamA - uParamB * 0.5, uParamA + uParamB * 0.5, signal));
  }

  float maskMul = 1.0;
  if (uHasMask != 0) {
    float m = texelFetch(uLayerMask, px, 0).r;
    if (uHasLiveStroke != 0 && uLiveMaskStroke != 0) {
      float sa = clamp(texelFetch(uStrokeAlbedo, px, 0).a * uLiveOpacity, 0.0, 1.0);
      float ink = uLiveErase != 0 ? 0.0 : 1.0;
      m = mix(m, ink, sa);
    }
    maskMul = uInvertMask != 0 ? (1.0 - m) : m;
  }

  vec4 w4 = clamp(srcChAlpha * uLayerChanMask * uOpacity * maskMul, 0.0, 1.0);
  if (w4.r <= 0.001 && w4.g <= 0.001 && w4.b <= 0.001 && w4.a <= 0.001) {
    fragColor = uOutTarget == 0 ? dstA : dstO;
    return;
  }

  if (uOutTarget == 0) {
    vec3 bRgb = blendRgb(dstA.rgb, srcRgb, uBlendMode);
    fragColor = vec4(mix(dstA.rgb, bRgb, w4.r), max(dstA.a, w4.r));
  } else {
    float r = mix(dstO.g, srcRough, w4.g);
    float m = mix(dstO.b, srcMetal, w4.b);
    float h = clamp(mix(dstO.a, srcHeight, w4.a), 0.0, 1.0);
    fragColor = vec4(dstO.r, r, m, h);
  }
}
`;

const DILATE_2PX_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uAuxCueTex;
in vec2 vUv;
out vec4 fragColor;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  if (texelFetch(uAuxCueTex, px, 0).a > 0.5) {
    fragColor = texelFetch(uSource, px, 0);
    return;
  }
  vec4 sum = vec4(0.0);
  float cnt = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dy == 0) continue;
      if (texelFetch(uAuxCueTex, px + ivec2(dx, dy), 0).a > 0.5) {
        sum += texelFetch(uSource, px + ivec2(dx, dy), 0);
        cnt += 1.0;
      }
    }
  }
  fragColor = cnt > 0.0 ? sum / cnt : texelFetch(uSource, px, 0);
}
`;

const HEIGHT_TO_NORMAL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uOrmhTex;
uniform sampler2D uBakedNormalTex;
uniform int uHasBakedNormal;
in vec2 vUv;
out vec4 fragColor;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  float hL = texelFetch(uOrmhTex, px + ivec2(-1, 0), 0).a;
  float hR = texelFetch(uOrmhTex, px + ivec2(1, 0), 0).a;
  float hD = texelFetch(uOrmhTex, px + ivec2(0, -1), 0).a;
  float hU = texelFetch(uOrmhTex, px + ivec2(0, 1), 0).a;
  vec3 bump = normalize(vec3((hL - hR) * 3.4, (hD - hU) * 3.4, 1.0));
  if (uHasBakedNormal != 0) {
    vec3 bn = texelFetch(uBakedNormalTex, px, 0).xyz * 2.0 - 1.0;
    bump = normalize(vec3(bn.xy + bump.xy * 0.75, max(0.05, bn.z)));
  }
  fragColor = vec4(bump * 0.5 + 0.5, 1.0);
}
`;

const CHANNEL_PREVIEW_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uAlbedoTex;
uniform sampler2D uOrmhTex;
uniform sampler2D uMaskTex;
uniform int uMode; // 0=lit/baseColor, 1=roughness, 2=metalness, 3=height, 4=mask
uniform int uHasMask;
uniform int uInvertMask;
in vec2 vUv;
out vec4 fragColor;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  if (uMode == 0) {
    fragColor = texelFetch(uAlbedoTex, px, 0);
  } else if (uMode == 1) {
    float v = texelFetch(uOrmhTex, px, 0).g;
    fragColor = vec4(vec3(v), 1.0);
  } else if (uMode == 2) {
    float v = texelFetch(uOrmhTex, px, 0).b;
    fragColor = vec4(vec3(v), 1.0);
  } else if (uMode == 3) {
    float v = texelFetch(uOrmhTex, px, 0).a;
    fragColor = vec4(vec3(v), 1.0);
  } else {
    float m = uHasMask != 0 ? texelFetch(uMaskTex, px, 0).r : 1.0;
    if (uInvertMask != 0) m = 1.0 - m;
    fragColor = vec4(vec3(m), 1.0);
  }
}
`;

const BLEND_INDEX = { Normal: 0, Multiply: 1, Screen: 2, Overlay: 3, Add: 4, Darken: 5 };
const TIP_INDEX = { round: 0, chisel: 1, chalk: 2, splatter: 3, sponge: 4, stamp: 5, custom: 6 };
const GEN_INDEX = { "edge-wear": 0, "crevice-dirt": 1, "top-dust": 2 };
const CHAN_VIEW_INDEX = { lit: 0, baseColor: 0, roughness: 1, metalness: 2, height: 3, mask: 4 };

export class GpuPaintSession {
  constructor(renderer, res = 512) {
    this.renderer = renderer;
    this.res = res;
    this.isActive = !!renderer?.capabilities?.isWebGL2 && renderer.getContext()?.getParameter?.(0x1F01) !== "MockGPU";

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadMesh = new THREE.Mesh(this.quadGeo, new THREE.MeshBasicMaterial());
    this.quadScene.add(this.quadMesh);

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };

    this.strokeAlbedoA = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.strokeAlbedoB = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.strokeOrmhA = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.strokeOrmhB = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.strokeFlip = 0;

    this.compAlbedoA = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.compAlbedoB = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.compOrmhA = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.compOrmhB = new THREE.WebGLRenderTarget(res, res, rtOpts);

    this.finalAlbedoRT = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.finalAlbedoRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.finalOrmhRT = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.finalNormalRT = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.displayAlbedoRT = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.displayAlbedoRT.texture.colorSpace = THREE.SRGBColorSpace;

    this.dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.dummyTex.needsUpdate = true;
    this.posPartTex = null;
    this.normIslandTex = null;
    this.auxCueTex = null;
    this.bakedNormalTex = null;
    this.hasBakedNormal = false;
    this.stampTex = null;
    this.hasStamp = false;
    this.layerTargetRegistry = new Set();

    // Shared materials
    this.blitMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLIT_FRAG,
      uniforms: { uSource: { value: this.dummyTex } },
      depthTest: false, depthWrite: false,
    });

    this.dabMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DAB_COMMON,
      uniforms: {
        uPrevAlbedo: { value: this.dummyTex },
        uPrevOrmh: { value: this.dummyTex },
        uPosPartTex: { value: this.dummyTex },
        uNormIslandTex: { value: this.dummyTex },
        uStampTex: { value: this.dummyTex },
        uMode: { value: 0 },
        uTip: { value: 0 },
        uHasStamp: { value: 0 },
        uPartFilter: { value: -1 },
        uHitPos: { value: new THREE.Vector3() },
        uHitNormal: { value: new THREE.Vector3(0, 1, 0) },
        uBrushRight: { value: new THREE.Vector3(1, 0, 0) },
        uBrushUp: { value: new THREE.Vector3(0, 0, 1) },
        uStrokeUv: { value: new THREE.Vector2(0.5, 0.5) },
        uWorldRadius: { value: 0.2 },
        uUvRadius: { value: 0.05 },
        uHardness: { value: 0.7 },
        uFlow: { value: 0.8 },
        uAngle: { value: 0 },
        uRoundness: { value: 1.0 },
        uFalloffCurve: { value: sampleCurveLut([[0, 0], [0.5, 0.55], [1, 1]], 17) },
        uBrushColor: { value: new THREE.Vector3(1, 1, 1) },
        uBrushRough: { value: 0.4 },
        uBrushMetal: { value: 0.1 },
        uBrushHeight: { value: 0.2 },
        uSeed: { value: 1 },
        uPassTarget: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });

    this.commitMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMMIT_STROKE_FRAG,
      uniforms: {
        uBaseTex: { value: null },
        uStrokeTex: { value: null },
        uPrevChanAlphaTex: { value: this.dummyTex },
        uOpacity: { value: 1 },
        uChanMask: { value: new THREE.Vector4(1, 1, 1, 1) },
        uIsErase: { value: 0 },
        uIsMask: { value: 0 },
        uPassKind: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });

    this.compMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_LAYER_FRAG,
      uniforms: {
        uAccAlbedo: { value: this.dummyTex },
        uAccOrmh: { value: this.dummyTex },
        uPosPartTex: { value: this.dummyTex },
        uAuxCueTex: { value: this.dummyTex },
        uLayerAlbedo: { value: this.dummyTex },
        uLayerOrmh: { value: this.dummyTex },
        uLayerChanAlpha: { value: this.dummyTex },
        uLayerMask: { value: this.dummyTex },
        uStrokeAlbedo: { value: this.dummyTex },
        uStrokeOrmh: { value: this.dummyTex },
        uPatternTex: { value: this.dummyTex },
        uLayerKind: { value: 0 },
        uBlendMode: { value: 0 },
        uOpacity: { value: 1 },
        uPartFilter: { value: -1 },
        uHasMask: { value: 0 },
        uInvertMask: { value: 0 },
        uHasLiveStroke: { value: 0 },
        uLiveErase: { value: 0 },
        uLiveMaskStroke: { value: 0 },
        uLiveOpacity: { value: 1 },
        uLiveChanMask: { value: new THREE.Vector4(1, 1, 1, 1) },
        uLayerChanMask: { value: new THREE.Vector4(1, 1, 1, 1) },
        uHasPattern: { value: 0 },
        uPatternRepeats: { value: 3 },
        uColorA: { value: new THREE.Vector3(1, 1, 1) },
        uRoughA: { value: 0.5 },
        uMetalA: { value: 0 },
        uHeightA: { value: 0.5 },
        uParamA: { value: 10 },
        uParamB: { value: 0.1 },
        uParamC: { value: 0.4 },
        uGenPreset: { value: 0 },
        uOutTarget: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });

    this.dilateMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DILATE_2PX_FRAG,
      uniforms: { uSource: { value: this.dummyTex }, uAuxCueTex: { value: this.dummyTex } },
      depthTest: false, depthWrite: false,
    });

    this.normalMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: HEIGHT_TO_NORMAL_FRAG,
      uniforms: { uOrmhTex: { value: this.dummyTex }, uBakedNormalTex: { value: this.dummyTex }, uHasBakedNormal: { value: 0 } },
      depthTest: false, depthWrite: false,
    });

    this.viewMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: CHANNEL_PREVIEW_FRAG,
      uniforms: {
        uAlbedoTex: { value: this.dummyTex },
        uOrmhTex: { value: this.dummyTex },
        uMaskTex: { value: this.dummyTex },
        uMode: { value: 0 },
        uHasMask: { value: 0 },
        uInvertMask: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });

    this.scratchMaskRT = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this.scratchChanAlphaRT = new THREE.WebGLRenderTarget(res, res, rtOpts);
    this._clearRT(this.strokeAlbedoA, 0, 0, 0, 0);
    this._clearRT(this.strokeAlbedoB, 0, 0, 0, 0);
    this._clearRT(this.strokeOrmhA, 0.5, 0, 0.5, 0);
    this._clearRT(this.strokeOrmhB, 0.5, 0, 0.5, 0);
  }

  _rtOpts() {
    return {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };
  }

  _renderPass(material, target) {
    if (!this.isActive) return;
    const prev = this.renderer.getRenderTarget();
    const prevClear = this.renderer.autoClear;
    const prevScissor = this.renderer.getScissorTest?.() ?? false;
    this.renderer.autoClear = false;
    this.renderer.setScissorTest(false);
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.setRenderTarget(prev);
    this.renderer.setScissorTest(prevScissor);
    this.renderer.autoClear = prevClear;
  }

  _clearRT(rt, r = 0, g = 0, b = 0, a = 0) {
    if (!this.isActive || !rt) return;
    const prev = this.renderer.getRenderTarget();
    const prevScissor = this.renderer.getScissorTest?.() ?? false;
    const prevCol = new THREE.Color();
    this.renderer.getClearColor(prevCol);
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setScissorTest(false);
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(new THREE.Color(r, g, b), a);
    this.renderer.clear(true, false, false);
    this.renderer.setClearColor(prevCol, prevAlpha);
    this.renderer.setRenderTarget(prev);
    this.renderer.setScissorTest(prevScissor);
  }

  _blit(srcTex, dstRT) {
    this.blitMat.uniforms.uSource.value = srcTex;
    this._renderPass(this.blitMat, dstRT);
  }

  uploadMeshCues(cues, bakedMaps = null) {
    const res = this.res;
    const n = res * res;
    const posSrc = cues.worldPos || cues.pos;
    const normSrc = cues.worldNormal || cues.norm;
    const posPart = new Float32Array(n * 4);
    const normIsland = new Float32Array(n * 4);
    const auxCue = new Uint8Array(n * 4);

    const toByte = (arr, idx, fallbackByte) => {
      if (!arr) return fallbackByte;
      const v = arr[idx];
      return arr instanceof Float32Array
        ? Math.max(0, Math.min(255, Math.round(v * 255)))
        : Math.max(0, Math.min(255, Math.round(v)));
    };
    const bRes = bakedMaps?.res || 0;
    const hasBakedAo = !!(bakedMaps?.ao && bRes > 0);
    const hasBakedCurv = !!(bakedMaps?.curvature && bRes > 0);

    // Flip top-down meshCues rows -> bottom-up UV space (v=0 at row 0) so flipY=false matches 100% natively!
    for (let py = 0; py < res; py++) {
      const topY = res - 1 - py;
      const srcRow = topY * res;
      const dstRow = py * res;
      const bY = bRes > 0 ? Math.min(bRes - 1, Math.floor((topY / res) * bRes)) : 0;
      for (let px = 0; px < res; px++) {
        const sp = srcRow + px;
        const dp = dstRow + px;
        const o4 = dp * 4;
        posPart[o4] = posSrc[sp * 3];
        posPart[o4 + 1] = posSrc[sp * 3 + 1];
        posPart[o4 + 2] = posSrc[sp * 3 + 2];
        posPart[o4 + 3] = cues.partAt[sp];

        const nx = normSrc[sp * 3], ny = normSrc[sp * 3 + 1], nz = normSrc[sp * 3 + 2];
        normIsland[o4] = nx;
        normIsland[o4 + 1] = ny;
        normIsland[o4 + 2] = nz;
        normIsland[o4 + 3] = cues.islandAt[sp];

        const bp = bRes > 0 ? bY * bRes + Math.min(bRes - 1, Math.floor((px / res) * bRes)) : sp;
        const aoVal = hasBakedAo ? toByte(bakedMaps.ao, bp, 217) : toByte(cues.ao, sp, 217);
        const curvVal = hasBakedCurv ? toByte(bakedMaps.curvature, bp, 128) : toByte(cues.curvature, sp, 128);
        const dustVal = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
        auxCue[o4] = aoVal;
        auxCue[o4 + 1] = curvVal;
        auxCue[o4 + 2] = dustVal;
        auxCue[o4 + 3] = cues.partAt[sp] >= 0 ? 255 : 0;
      }
    }

    if (this.posPartTex) this.posPartTex.dispose();
    if (this.normIslandTex) this.normIslandTex.dispose();
    if (this.auxCueTex) this.auxCueTex.dispose();

    const makeF = (d) => {
      const t = new THREE.DataTexture(d, res, res, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
      return t;
    };
    this.posPartTex = makeF(posPart);
    this.normIslandTex = makeF(normIsland);

    this.auxCueTex = new THREE.DataTexture(auxCue, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.auxCueTex.minFilter = THREE.NearestFilter; this.auxCueTex.magFilter = THREE.NearestFilter;
    this.auxCueTex.generateMipmaps = false; this.auxCueTex.flipY = false; this.auxCueTex.needsUpdate = true;

    if (this.bakedNormalTex) { this.bakedNormalTex.dispose(); this.bakedNormalTex = null; }
    this.hasBakedNormal = false;
    if (bakedMaps?.normalRgba && bakedMaps.res === res) {
      const flipped = new Uint8Array(n * 4);
      const stride = res * 4;
      for (let y = 0; y < res; y++) flipped.set(bakedMaps.normalRgba.subarray((res - 1 - y) * stride, (res - y) * stride), y * stride);
      this.bakedNormalTex = new THREE.DataTexture(flipped, res, res, THREE.RGBAFormat);
      this.bakedNormalTex.minFilter = THREE.LinearFilter; this.bakedNormalTex.magFilter = THREE.LinearFilter;
      this.bakedNormalTex.flipY = false; this.bakedNormalTex.needsUpdate = true;
      this.hasBakedNormal = true;
    }

    this.dabMat.uniforms.uPosPartTex.value = this.posPartTex;
    this.dabMat.uniforms.uNormIslandTex.value = this.normIslandTex;
    this.compMat.uniforms.uPosPartTex.value = this.posPartTex;
    this.compMat.uniforms.uAuxCueTex.value = this.auxCueTex;
    this.dilateMat.uniforms.uAuxCueTex.value = this.auxCueTex;
    this.normalMat.uniforms.uBakedNormalTex.value = this.bakedNormalTex || this.dummyTex;
    this.normalMat.uniforms.uHasBakedNormal.value = this.hasBakedNormal ? 1 : 0;
  }

  ensureStampTexture(stampData, preferTipAlpha = false) {
    const srcPix = preferTipAlpha
      ? (stampData?.tipAlpha || stampData?.albedo || stampData?.rgba)
      : (stampData?.albedo || stampData?.rgba);
    if (!srcPix || !stampData?.width) {
      this.hasStamp = false;
      return;
    }
    const w = stampData.width;
    const h = stampData.heightPx || w;
    if (this._stampRef === srcPix && this.stampTex) {
      this.hasStamp = true;
      return;
    }
    this._stampRef = srcPix;
    if (this.stampTex) this.stampTex.dispose();
    const flipped = new Uint8Array(w * h * 4);
    const stride = w * 4;
    for (let y = 0; y < h; y++) flipped.set(srcPix.subarray((h - 1 - y) * stride, (h - y) * stride), y * stride);
    this.stampTex = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat);
    this.stampTex.minFilter = THREE.LinearFilter;
    this.stampTex.magFilter = THREE.LinearFilter;
    this.stampTex.flipY = false;
    this.stampTex.needsUpdate = true;
    this.hasStamp = true;
    this.dabMat.uniforms.uStampTex.value = this.stampTex;
  }

  ensureLayerTargets(layer) {
    if (!layer._gpu) {
      const opts = this._rtOpts();
      const isPaint = layer.kind === "paint" || layer.kind === "decal";
      layer._gpu = {
        albedoRT: isPaint ? new THREE.WebGLRenderTarget(this.res, this.res, opts) : null,
        ormhRT: isPaint ? new THREE.WebGLRenderTarget(this.res, this.res, opts) : null,
        chanAlphaRT: isPaint ? new THREE.WebGLRenderTarget(this.res, this.res, opts) : null,
        maskRT: null,
        patternTex: null,
      };
      if (layer._gpu.albedoRT) {
        this._clearRT(layer._gpu.albedoRT, 0, 0, 0, 0);
        this.layerTargetRegistry.add(layer._gpu.albedoRT);
      }
      if (layer._gpu.ormhRT) {
        this._clearRT(layer._gpu.ormhRT, 0.5, 0, 0.5, 0);
        this.layerTargetRegistry.add(layer._gpu.ormhRT);
      }
      if (layer._gpu.chanAlphaRT) {
        this._clearRT(layer._gpu.chanAlphaRT, 0, 0, 0, 0);
        this.layerTargetRegistry.add(layer._gpu.chanAlphaRT);
      }
      // If CPU pixels already have data (e.g. from bridge/decal/mask fill), upload once
      if (layer.pixels && layer._gpu.albedoRT) this.syncCpuPixelsToLayerGpu(layer);
    }
    if (layer.mask && !layer._gpu.maskRT) {
      layer._gpu.maskRT = new THREE.WebGLRenderTarget(this.res, this.res, this._rtOpts());
      this.layerTargetRegistry.add(layer._gpu.maskRT);
      this.syncMaskCpuToGpu(layer);
    }
    const pd = layer.fill?.patternData;
    const patPix = pd?.albedo || pd?.rgba;
    if (layer.kind === "fill" && patPix && pd?.width && layer._gpu.patternRef !== patPix) {
      if (layer._gpu.patternTex) layer._gpu.patternTex.dispose();
      const pw = pd.width, ph = pd.heightPx || pd.width;
      const flipped = new Uint8Array(pw * ph * 4);
      const stride = pw * 4;
      for (let y = 0; y < ph; y++) flipped.set(patPix.subarray((ph - 1 - y) * stride, (ph - y) * stride), y * stride);
      const tex = new THREE.DataTexture(flipped, pw, ph, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.flipY = false; tex.needsUpdate = true;
      layer._gpu.patternTex = tex;
      layer._gpu.patternRef = patPix;
    }
    return layer._gpu;
  }

  syncCpuPixelsToLayerGpu(layer) {
    if (!this.isActive || !layer?.pixels) return;
    const gpu = this.ensureLayerTargets(layer);
    if (!gpu.albedoRT || !gpu.ormhRT) return;
    const res = this.res;
    const n = res * res;
    const alb = new Uint8Array(n * 4);
    const orm = new Uint8Array(n * 4);
    const cal = new Uint8Array(n * 4);
    const ra = layer.pixels.roughAlpha;
    const ma = layer.pixels.metalAlpha;
    const ha = layer.pixels.heightAlpha;
    for (let py = 0; py < res; py++) {
      const sRow = (res - 1 - py) * res;
      const dRow = py * res;
      for (let px = 0; px < res; px++) {
        const sp = sRow + px;
        const dp = dRow + px;
        const o = dp * 4;
        const si = sp * 4;
        const aByte = layer.pixels.albedo[si + 3];
        alb[o] = layer.pixels.albedo[si];
        alb[o + 1] = layer.pixels.albedo[si + 1];
        alb[o + 2] = layer.pixels.albedo[si + 2];
        alb[o + 3] = aByte;
        orm[o] = layer.pixels.roughness[sp];
        orm[o + 1] = layer.pixels.metalness[sp];
        orm[o + 2] = layer.pixels.height[sp];
        orm[o + 3] = aByte;
        cal[o] = aByte;
        cal[o + 1] = ra ? ra[sp] : aByte;
        cal[o + 2] = ma ? ma[sp] : aByte;
        cal[o + 3] = ha ? ha[sp] : aByte;
      }
    }
    const tA = new THREE.DataTexture(alb, res, res, THREE.RGBAFormat); tA.flipY = false; tA.needsUpdate = true;
    const tO = new THREE.DataTexture(orm, res, res, THREE.RGBAFormat); tO.flipY = false; tO.needsUpdate = true;
    const tC = new THREE.DataTexture(cal, res, res, THREE.RGBAFormat); tC.flipY = false; tC.needsUpdate = true;
    this._blit(tA, gpu.albedoRT);
    this._blit(tO, gpu.ormhRT);
    if (gpu.chanAlphaRT) this._blit(tC, gpu.chanAlphaRT);
    tA.dispose(); tO.dispose(); tC.dispose();
  }

  syncMaskCpuToGpu(layer) {
    if (!this.isActive || !layer?.mask?.pixels) return;
    const gpu = this.ensureLayerTargets(layer);
    const res = this.res;
    const data = new Uint8Array(res * res * 4);
    for (let py = 0; py < res; py++) {
      const sRow = (res - 1 - py) * res;
      const dRow = py * res;
      for (let px = 0; px < res; px++) {
        const v = layer.mask.pixels[sRow + px];
        const o = (dRow + px) * 4;
        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    t.flipY = false; t.needsUpdate = true;
    this._blit(t, gpu.maskRT);
    t.dispose();
  }

  fillMaskGpu(layer, val01) {
    if (!this.isActive || !layer?.mask) return;
    const gpu = this.ensureLayerTargets(layer);
    this._clearRT(gpu.maskRT, val01, val01, val01, 1);
  }

  beginStroke() {
    this.strokeFlip = 0;
    this._clearRT(this.strokeAlbedoA, 0, 0, 0, 0);
    this._clearRT(this.strokeAlbedoB, 0, 0, 0, 0);
    this._clearRT(this.strokeOrmhA, 0.5, 0, 0.5, 0);
    this._clearRT(this.strokeOrmhB, 0.5, 0, 0.5, 0);
  }

  dabStroke({ mode = "3d", hitPos, hitNormal, uv, worldRadius, uvRadius, brush, partFilter = -1, seed = 1 }) {
    if (!this.isActive || !this.posPartTex) return;
    const [r, g, b] = hexToRgb(brush.color || "#ffffff");
    const u = this.dabMat.uniforms;
    u.uMode.value = mode === "3d" ? 0 : 1;
    const tipKey = brush.tool === "stamp" ? "stamp" : (brush.tip || "round");
    u.uTip.value = TIP_INDEX[tipKey] ?? 0;
    if (tipKey === "stamp" && brush.stampData) this.ensureStampTexture(brush.stampData, false);
    else if (tipKey === "custom" && brush.customTipData) this.ensureStampTexture(brush.customTipData, true);
    u.uHasStamp.value = this.hasStamp ? 1 : 0;
    u.uPartFilter.value = partFilter;
    if (hitPos) u.uHitPos.value.set(hitPos.x, hitPos.y, hitPos.z);
    if (hitNormal) {
      u.uHitNormal.value.set(hitNormal.x, hitNormal.y, hitNormal.z).normalize();
      const upRef = Math.abs(u.uHitNormal.value.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      u.uBrushRight.value.crossVectors(upRef, u.uHitNormal.value).normalize();
      u.uBrushUp.value.crossVectors(u.uHitNormal.value, u.uBrushRight.value).normalize();
    }
    if (uv) u.uStrokeUv.value.set(uv.x, uv.y);
    u.uWorldRadius.value = worldRadius || 0.2;
    u.uUvRadius.value = uvRadius || 0.05;
    u.uHardness.value = brush.hardness ?? 0.72;
    u.uFlow.value = brush.flow ?? 0.78;
    u.uAngle.value = ((brush.angle || 0) * Math.PI) / 180;
    u.uRoundness.value = Math.max(0.15, Math.min(1.0, brush.roundness ?? 1.0));
    u.uFalloffCurve.value = sampleCurveLut(brush.curves?.falloff || [[0, 0], [0.5, 0.55], [1, 1]], 17);
    u.uBrushColor.value.set(r / 255, g / 255, b / 255);
    u.uBrushRough.value = brush.roughness ?? 0.4;
    u.uBrushMetal.value = brush.metalness ?? 0.1;
    u.uBrushHeight.value = brush.height ?? 0.2;
    u.uSeed.value = seed;

    const srcA = this.strokeFlip === 0 ? this.strokeAlbedoA : this.strokeAlbedoB;
    const dstA = this.strokeFlip === 0 ? this.strokeAlbedoB : this.strokeAlbedoA;
    const srcO = this.strokeFlip === 0 ? this.strokeOrmhA : this.strokeOrmhB;
    const dstO = this.strokeFlip === 0 ? this.strokeOrmhB : this.strokeOrmhA;

    u.uPrevAlbedo.value = srcA.texture;
    u.uPrevOrmh.value = srcO.texture;

    u.uPassTarget.value = 0;
    this._renderPass(this.dabMat, dstA);

    u.uPassTarget.value = 1;
    this._renderPass(this.dabMat, dstO);

    this.strokeFlip = 1 - this.strokeFlip;
  }

  currentStrokeTargets() {
    return {
      albedoRT: this.strokeFlip === 0 ? this.strokeAlbedoA : this.strokeAlbedoB,
      ormhRT: this.strokeFlip === 0 ? this.strokeOrmhA : this.strokeOrmhB,
    };
  }

  commitStrokeToLayer(layer, brush, editingMask = false) {
    if (!this.isActive || !layer) return false;
    const gpu = this.ensureLayerTargets(layer);
    const st = this.currentStrokeTargets();
    const isErase = brush.tool === "erase";
    const ch = getToolChannels(brush);

    if (editingMask && layer.mask) {
      this._blit(gpu.maskRT.texture, this.scratchMaskRT);
      const u = this.commitMat.uniforms;
      u.uBaseTex.value = this.scratchMaskRT.texture;
      u.uStrokeTex.value = st.albedoRT.texture;
      u.uPrevChanAlphaTex.value = this.dummyTex;
      u.uOpacity.value = brush.opacity ?? 0.9;
      u.uChanMask.value.set(1, 1, 1, 1);
      u.uIsErase.value = isErase ? 1 : 0;
      u.uIsMask.value = 1;
      u.uPassKind.value = 0;
      this._renderPass(this.commitMat, gpu.maskRT);
      this.beginStroke();
      return true;
    }

    if (!gpu.albedoRT || !gpu.ormhRT || !gpu.chanAlphaRT) return false;
    this._blit(gpu.albedoRT.texture, this.compAlbedoA);
    this._blit(gpu.ormhRT.texture, this.compOrmhA);
    this._blit(gpu.chanAlphaRT.texture, this.scratchChanAlphaRT);

    const u = this.commitMat.uniforms;
    u.uOpacity.value = brush.opacity ?? 0.9;
    u.uChanMask.value.set(ch.albedo ? 1 : 0, ch.roughness ? 1 : 0, ch.metalness ? 1 : 0, ch.height ? 1 : 0);
    u.uPrevChanAlphaTex.value = this.scratchChanAlphaRT.texture;
    u.uIsErase.value = isErase ? 1 : 0;
    u.uIsMask.value = 0;

    u.uBaseTex.value = this.compAlbedoA.texture;
    u.uStrokeTex.value = st.albedoRT.texture;
    u.uPassKind.value = 0;
    this._renderPass(this.commitMat, gpu.albedoRT);

    u.uBaseTex.value = this.compOrmhA.texture;
    u.uStrokeTex.value = st.ormhRT.texture;
    u.uPassKind.value = 1;
    this._renderPass(this.commitMat, gpu.ormhRT);

    u.uBaseTex.value = this.scratchChanAlphaRT.texture;
    u.uStrokeTex.value = st.albedoRT.texture;
    u.uPassKind.value = 2;
    this._renderPass(this.commitMat, gpu.chanAlphaRT);

    this.beginStroke();
    return true;
  }

  cloneLayerSnapshot(layer, editingMask = false) {
    if (!this.isActive || !layer) return null;
    const gpu = this.ensureLayerTargets(layer);
    const opts = this._rtOpts();
    const snap = { layerId: layer.id, editingMask, albedoRT: null, ormhRT: null, chanAlphaRT: null, maskRT: null };
    if (gpu.albedoRT) {
      snap.albedoRT = new THREE.WebGLRenderTarget(this.res, this.res, opts);
      this._blit(gpu.albedoRT.texture, snap.albedoRT);
    }
    if (gpu.ormhRT) {
      snap.ormhRT = new THREE.WebGLRenderTarget(this.res, this.res, opts);
      this._blit(gpu.ormhRT.texture, snap.ormhRT);
    }
    if (gpu.chanAlphaRT) {
      snap.chanAlphaRT = new THREE.WebGLRenderTarget(this.res, this.res, opts);
      this._blit(gpu.chanAlphaRT.texture, snap.chanAlphaRT);
    }
    if (gpu.maskRT) {
      snap.maskRT = new THREE.WebGLRenderTarget(this.res, this.res, opts);
      this._blit(gpu.maskRT.texture, snap.maskRT);
    }
    return snap;
  }

  restoreLayerSnapshot(layer, snap) {
    if (!this.isActive || !layer || !snap) return;
    const gpu = this.ensureLayerTargets(layer);
    if (snap.albedoRT && gpu.albedoRT) this._blit(snap.albedoRT.texture, gpu.albedoRT);
    if (snap.ormhRT && gpu.ormhRT) this._blit(snap.ormhRT.texture, gpu.ormhRT);
    if (snap.chanAlphaRT && gpu.chanAlphaRT) this._blit(snap.chanAlphaRT.texture, gpu.chanAlphaRT);
    if (snap.maskRT && gpu.maskRT) this._blit(snap.maskRT.texture, gpu.maskRT);
  }

  disposeSnapshot(snap) {
    snap?.albedoRT?.dispose();
    snap?.ormhRT?.dispose();
    snap?.chanAlphaRT?.dispose();
    snap?.maskRT?.dispose();
  }

  composite(doc, { hasLiveStroke = false, liveBrush = null, viewChannel = "lit" } = {}) {
    if (!this.isActive || !this.posPartTex || !this.auxCueTex) return null;

    // Neutral clay base: Albedo=#e6e6de, ORM+Height=(AO=1.0, Rough=0.72, Metal=0.04, Height=0.5)
    this._clearRT(this.compAlbedoA, 230 / 255, 230 / 255, 222 / 255, 1.0);
    this._clearRT(this.compOrmhA, 1.0, 0.72, 0.04, 0.5);

    let accAlb = this.compAlbedoA, nxtAlb = this.compAlbedoB;
    let accOrm = this.compOrmhA, nxtOrm = this.compOrmhB;

    const st = this.currentStrokeTargets();
    const u = this.compMat.uniforms;
    u.uStrokeAlbedo.value = st.albedoRT.texture;
    u.uStrokeOrmh.value = st.ormhRT.texture;
    u.uLiveErase.value = liveBrush?.tool === "erase" ? 1 : 0;
    u.uLiveMaskStroke.value = doc.editingMask ? 1 : 0;
    u.uLiveOpacity.value = liveBrush?.opacity ?? 0.9;
    const liveCh = liveBrush ? getToolChannels(liveBrush) : { albedo: true, roughness: true, metalness: true, height: true };
    u.uLiveChanMask.value.set(liveCh.albedo ? 1 : 0, liveCh.roughness ? 1 : 0, liveCh.metalness ? 1 : 0, liveCh.height ? 1 : 0);

    const folderHidden = new Set();
    for (const l of doc.layers) if (l.kind === "folder" && !l.visible) folderHidden.add(l.id);

    for (const layer of doc.layers) {
      if (!layer.visible || layer.kind === "folder") continue;
      if (layer.parentId && folderHidden.has(layer.parentId)) continue;

      const gpu = this.ensureLayerTargets(layer);
      const isLive = hasLiveStroke && layer.id === doc.selectedLayerId;
      const lCh = layer.channels || { albedo: true, roughness: true, metalness: true, height: true };

      u.uAccAlbedo.value = accAlb.texture;
      u.uAccOrmh.value = accOrm.texture;
      u.uHasLiveStroke.value = isLive ? 1 : 0;
      u.uBlendMode.value = BLEND_INDEX[layer.blend] ?? 0;
      u.uOpacity.value = layer.opacity ?? 1;
      u.uPartFilter.value = layer.partFilter ?? -1;
      u.uHasMask.value = layer.mask?.enabled && gpu.maskRT ? 1 : 0;
      u.uInvertMask.value = layer.mask?.invert ? 1 : 0;
      u.uLayerMask.value = gpu.maskRT?.texture || this.dummyTex;
      u.uLayerChanMask.value.set(lCh.albedo ? 1 : 0, lCh.roughness ? 1 : 0, lCh.metalness ? 1 : 0, lCh.height ? 1 : 0);

      if (layer.kind === "paint" || layer.kind === "decal") {
        u.uLayerKind.value = 0;
        u.uLayerAlbedo.value = gpu.albedoRT?.texture || this.dummyTex;
        u.uLayerOrmh.value = gpu.ormhRT?.texture || this.dummyTex;
        u.uLayerChanAlpha.value = gpu.chanAlphaRT?.texture || this.dummyTex;
      } else if (layer.kind === "fill") {
        u.uLayerKind.value = 1;
        const [r, g, b] = hexToRgb(layer.fill?.color || "#cccccc");
        u.uColorA.value.set(r / 255, g / 255, b / 255);
        u.uRoughA.value = layer.fill?.roughness ?? 0.5;
        u.uMetalA.value = layer.fill?.metalness ?? 0;
        u.uHeightA.value = Math.max(0, Math.min(1, (layer.fill?.height ?? 0) * 0.5 + 0.5));
        u.uHasPattern.value = gpu.patternTex ? 1 : 0;
        u.uPatternTex.value = gpu.patternTex || this.dummyTex;
        u.uPatternRepeats.value = layer.fill?.patternRepeats || 3;
      } else if (layer.kind === "material") {
        u.uLayerKind.value = 2;
        const [r, g, b] = hexToRgb(layer.material?.color || "#888888");
        u.uColorA.value.set(r / 255, g / 255, b / 255);
        u.uRoughA.value = layer.material?.roughness ?? 0.4;
        u.uMetalA.value = layer.material?.metalness ?? 0.1;
        u.uHeightA.value = Math.max(0, Math.min(1, (layer.material?.height ?? 0) * 0.5 + 0.5));
        u.uParamA.value = layer.material?.grainScale ?? 10;
        u.uParamB.value = layer.material?.grainStrength ?? 0.08;
      } else if (layer.kind === "generator") {
        u.uLayerKind.value = 3;
        const [r, g, b] = hexToRgb(layer.generator?.color || "#d4d0c5");
        u.uColorA.value.set(r / 255, g / 255, b / 255);
        u.uRoughA.value = layer.generator?.roughness ?? 0.7;
        u.uMetalA.value = layer.generator?.metalness ?? 0.05;
        u.uHeightA.value = Math.max(0, Math.min(1, (layer.generator?.height ?? 0.1) * 0.5 + 0.5));
        u.uGenPreset.value = GEN_INDEX[layer.generator?.preset] ?? 0;
        u.uParamA.value = layer.generator?.threshold ?? 0.55;
        u.uParamB.value = layer.generator?.softness ?? 0.25;
        u.uParamC.value = layer.generator?.noiseMix ?? 0.4;
      }

      u.uOutTarget.value = 0;
      this._renderPass(this.compMat, nxtAlb);

      u.uOutTarget.value = 1;
      this._renderPass(this.compMat, nxtOrm);

      const tA = accAlb; accAlb = nxtAlb; nxtAlb = tA;
      const tO = accOrm; accOrm = nxtOrm; nxtOrm = tO;
    }

    // +2px UV gutter dilation pass
    this.dilateMat.uniforms.uSource.value = accAlb.texture;
    this._renderPass(this.dilateMat, this.finalAlbedoRT);

    this.dilateMat.uniforms.uSource.value = accOrm.texture;
    this._renderPass(this.dilateMat, this.finalOrmhRT);

    // GPU Height->Tangent Normal Sobel pass
    this.normalMat.uniforms.uOrmhTex.value = this.finalOrmhRT.texture;
    this._renderPass(this.normalMat, this.finalNormalRT);

    // Channel solo display pass
    const activeLayer = doc.layers.find((l) => l.id === doc.selectedLayerId);
    const activeMaskRT = activeLayer?._gpu?.maskRT || null;
    this.viewMat.uniforms.uAlbedoTex.value = this.finalAlbedoRT.texture;
    this.viewMat.uniforms.uOrmhTex.value = this.finalOrmhRT.texture;
    this.viewMat.uniforms.uMaskTex.value = activeMaskRT?.texture || this.dummyTex;
    this.viewMat.uniforms.uHasMask.value = activeLayer?.mask?.enabled && activeMaskRT ? 1 : 0;
    this.viewMat.uniforms.uInvertMask.value = activeLayer?.mask?.invert ? 1 : 0;
    this.viewMat.uniforms.uMode.value = CHAN_VIEW_INDEX[viewChannel] ?? 0;
    this._renderPass(this.viewMat, this.displayAlbedoRT);

    return {
      albedoTex: this.displayAlbedoRT.texture,
      ormhTex: this.finalOrmhRT.texture,
      normalTex: this.finalNormalRT.texture,
    };
  }

  samplePixel(u, v) {
    if (!this.isActive) return null;
    const x = Math.min(this.res - 1, Math.max(0, Math.floor(u * this.res)));
    const y = Math.min(this.res - 1, Math.max(0, Math.floor(v * this.res)));
    const aBuf = new Uint8Array(4);
    const oBuf = new Uint8Array(4);
    this.renderer.readRenderTargetPixels(this.finalAlbedoRT, x, y, 1, 1, aBuf);
    this.renderer.readRenderTargetPixels(this.finalOrmhRT, x, y, 1, 1, oBuf);
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return {
      color: `#${toHex(aBuf[0])}${toHex(aBuf[1])}${toHex(aBuf[2])}`,
      roughness: oBuf[1] / 255,
      metalness: oBuf[2] / 255,
      height: (oBuf[3] / 255 - 0.5) * 2,
    };
  }

  readExportChannels() {
    if (!this.isActive) return null;
    const res = this.res;
    const n = res * res;
    const rawAlb = new Uint8Array(n * 4);
    const rawOrm = new Uint8Array(n * 4);
    const rawNorm = new Uint8Array(n * 4);
    this.renderer.readRenderTargetPixels(this.finalAlbedoRT, 0, 0, res, res, rawAlb);
    this.renderer.readRenderTargetPixels(this.finalOrmhRT, 0, 0, res, res, rawOrm);
    this.renderer.readRenderTargetPixels(this.finalNormalRT, 0, 0, res, res, rawNorm);

    const albedo = new Uint8ClampedArray(n * 4);
    const normal = new Uint8ClampedArray(n * 4);
    const roughness = new Uint8ClampedArray(n);
    const metalness = new Uint8ClampedArray(n);
    for (let y = 0; y < res; y++) {
      const sRow = (res - 1 - y) * res;
      const dRow = y * res;
      for (let x = 0; x < res; x++) {
        const sp = sRow + x;
        const dp = dRow + x;
        const si4 = sp * 4;
        const di4 = dp * 4;
        albedo[di4] = rawAlb[si4]; albedo[di4 + 1] = rawAlb[si4 + 1]; albedo[di4 + 2] = rawAlb[si4 + 2]; albedo[di4 + 3] = 255;
        normal[di4] = rawNorm[si4]; normal[di4 + 1] = rawNorm[si4 + 1]; normal[di4 + 2] = rawNorm[si4 + 2]; normal[di4 + 3] = 255;
        roughness[dp] = rawOrm[si4 + 1];
        metalness[dp] = rawOrm[si4 + 2];
      }
    }
    return { albedo, roughness, metalness, normal };
  }

  dispose() {
    this.strokeAlbedoA.dispose(); this.strokeAlbedoB.dispose();
    this.strokeOrmhA.dispose(); this.strokeOrmhB.dispose();
    this.compAlbedoA.dispose(); this.compAlbedoB.dispose();
    this.compOrmhA.dispose(); this.compOrmhB.dispose();
    this.finalAlbedoRT.dispose(); this.finalOrmhRT.dispose();
    this.finalNormalRT.dispose(); this.displayAlbedoRT.dispose();
    this.scratchMaskRT.dispose();
    this.scratchChanAlphaRT.dispose();
    this.posPartTex?.dispose(); this.normIslandTex?.dispose();
    this.auxCueTex?.dispose(); this.bakedNormalTex?.dispose();
    this.stampTex?.dispose(); this.dummyTex?.dispose();
    for (const rt of this.layerTargetRegistry) rt?.dispose();
    this.layerTargetRegistry.clear();
    this.quadGeo.dispose(); this.quadMesh.material.dispose();
    this.blitMat.dispose(); this.dabMat.dispose(); this.commitMat.dispose();
    this.compMat.dispose(); this.dilateMat.dispose(); this.normalMat.dispose();
    this.viewMat.dispose();
  }
}

export const PAINT_GLSL3_SHADERS = {
  BLIT_FRAG,
  DAB_COMMON,
  COMMIT_STROKE_FRAG,
  COMPOSITE_LAYER_FRAG,
  DILATE_2PX_FRAG,
  HEIGHT_TO_NORMAL_FRAG,
  CHANNEL_PREVIEW_FRAG,
};
