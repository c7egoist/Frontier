// GLSL ES 3.00 Shaders for Frontier GTX Reflection Benchmark
// Canonical Right-Handed Coordinate Basis: +X Forward, +Y Left, +Z Up (X x Y = +Z)

export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const COMMON_MATERIAL_GLSL = `
struct SurfaceMat {
  vec3 albedo;
  float roughness;
  vec3 emissive;
  float metalness;
  float coat;
  float coatRough;
};

SurfaceMat evalMaterial(int matId, vec3 worldPos, vec3 paintColor) {
  SurfaceMat m;
  m.albedo = vec3(0.5);
  m.roughness = 0.35;
  m.emissive = vec3(0.0);
  m.metalness = 0.0;
  m.coat = 0.0;
  m.coatRough = 0.04;

  if (matId == 1) {
    // Proving-ground glossy satin tarmac with subtle lane lines & grid
    float gx = abs(fract(worldPos.x * 0.25 + 0.5) - 0.5);
    float gy = abs(fract(worldPos.y * 0.25 + 0.5) - 0.5);
    float grid = 1.0 - smoothstep(0.008, 0.016, min(gx, gy));
    float lane = (1.0 - smoothstep(0.04, 0.06, abs(abs(worldPos.y) - 3.65))) * step(abs(worldPos.x), 11.0);
    vec3 baseAsphalt = mix(vec3(0.042, 0.046, 0.054), vec3(0.075, 0.082, 0.098), grid * 0.55);
    m.albedo = mix(baseAsphalt, vec3(0.68, 0.54, 0.14), lane * 0.75);
    m.roughness = mix(0.22, 0.38, lane);
    m.metalness = 0.05;
    m.coat = 0.45;
    m.coatRough = 0.14;
  } else if (matId == 2) {
    // Silver Chrome Mirror Inspection Wall / Bollard (multi-bounce showcase!)
    m.albedo = vec3(0.90, 0.93, 0.97);
    m.roughness = 0.035;
    m.metalness = 0.98;
    m.coat = 0.5;
    m.coatRough = 0.03;
  } else if (matId == 3) {
    // Warm Champagne-Gold Mirror Inspection Wall / Bollard (multi-bounce tint showcase!)
    m.albedo = vec3(0.94, 0.74, 0.44);
    m.roughness = 0.045;
    m.metalness = 0.96;
    m.coat = 0.4;
    m.coatRough = 0.04;
  } else if (matId == 4) {
    // Architectural Dark Anodized Frame / Portal Pillar
    m.albedo = vec3(0.11, 0.12, 0.15);
    m.roughness = 0.28;
    m.metalness = 0.65;
  } else if (matId == 5) {
    // Overhead High-Luminance LED Portal Strip
    m.albedo = vec3(0.95, 0.98, 1.0);
    m.roughness = 0.15;
    m.emissive = vec3(7.5, 8.6, 10.5);
  } else if (matId == 6) {
    // ControlVehicle Metallic Clearcoat Bodywork
    m.albedo = paintColor;
    m.roughness = 0.11;
    m.metalness = 0.82;
    m.coat = 1.0;
    m.coatRough = 0.032;
  } else if (matId == 7) {
    // ControlVehicle Laminated Cabin Glazing
    m.albedo = vec3(0.03, 0.045, 0.065);
    m.roughness = 0.025;
    m.metalness = 0.10;
    m.coat = 1.0;
    m.coatRough = 0.02;
  } else if (matId == 8 || matId == 15) {
    // Satin Carbon Aero Cladding & Grille
    m.albedo = vec3(0.055, 0.058, 0.066);
    m.roughness = 0.24;
    m.metalness = 0.45;
    m.coat = 0.35;
    m.coatRough = 0.12;
  } else if (matId == 9 || matId == 16) {
    // Interior Cabin Trim & Brake Hub
    m.albedo = vec3(0.09, 0.095, 0.11);
    m.roughness = 0.42;
    m.metalness = 0.25;
  } else if (matId == 10) {
    // Brushed Machined Alloy Rim
    m.albedo = vec3(0.84, 0.87, 0.92);
    m.roughness = 0.08;
    m.metalness = 0.95;
    m.coat = 0.6;
    m.coatRough = 0.05;
  } else if (matId == 11) {
    // Vulcanized Tread Tyre Rubber
    m.albedo = vec3(0.045, 0.046, 0.05);
    m.roughness = 0.62;
    m.metalness = 0.02;
  } else if (matId == 12 || matId == 13) {
    // LED Headlamp Lens & Core
    m.albedo = vec3(0.9, 0.95, 1.0);
    m.roughness = 0.05;
    m.emissive = (matId == 13) ? vec3(9.0, 9.6, 11.0) : vec3(2.4, 2.8, 3.6);
    m.coat = 1.0;
    m.coatRough = 0.03;
  } else if (matId == 14) {
    // Rear Crimson Taillamp Bar
    m.albedo = vec3(0.65, 0.03, 0.04);
    m.roughness = 0.06;
    m.emissive = vec3(8.5, 0.45, 0.35);
    m.coat = 1.0;
    m.coatRough = 0.03;
  } else if (matId == 17) {
    // Safety Orange Slalom Bollard
    m.albedo = vec3(0.92, 0.26, 0.04);
    m.roughness = 0.18;
    m.metalness = 0.1;
    m.coat = 0.65;
    m.coatRough = 0.08;
  }
  return m;
}

vec3 evalSkyAndClouds(vec3 dir, vec3 sunDir) {
  float up = clamp(dir.z, -0.2, 1.0);
  vec3 horizon = vec3(0.52, 0.66, 0.86);
  vec3 zenith  = vec3(0.09, 0.21, 0.48);
  vec3 ground  = vec3(0.035, 0.038, 0.045);
  vec3 sky = (up >= 0.0)
    ? mix(horizon, zenith, pow(up, 0.58))
    : mix(horizon * 0.45, ground, clamp(-up * 6.0, 0.0, 1.0));

  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.0, 0.82, 0.56) * pow(sunCos, 16.0) * 0.55;
  sky += vec3(1.0, 0.93, 0.80) * smoothstep(0.99935, 0.99985, sunCos) * 14.0;

  // Lightweight procedural cumulus band (matches non-bottleneck sky/clouds backdrop)
  if (dir.z > 0.04) {
    vec2 cuv = dir.xy / (dir.z + 0.18) * 0.55;
    float n = sin(cuv.x * 2.3 + 0.7) * cos(cuv.y * 2.1 - 0.4)
            + 0.5 * sin(cuv.x * 5.1 - cuv.y * 3.7)
            + 0.25 * cos(cuv.x * 9.3 + cuv.y * 8.1);
    float cloud = smoothstep(0.32, 1.15, n) * smoothstep(0.04, 0.24, dir.z);
    vec3 cloudLit = mix(vec3(0.58, 0.65, 0.76), vec3(1.25, 1.18, 1.08), 0.5 + 0.5 * sunCos);
    sky = mix(sky, cloudLit, cloud * 0.62);
  }
  return sky;
}

vec3 evalSurfaceDirectRadiance(vec3 pos, vec3 nrm, vec3 viewDir, SurfaceMat m, vec3 sunDir) {
  float ndl = max(dot(nrm, sunDir), 0.0);
  vec3 sunIrr = vec3(3.1, 2.85, 2.55) * ndl;
  vec3 skyIrr = mix(vec3(0.10, 0.11, 0.14), vec3(0.36, 0.48, 0.68), nrm.z * 0.5 + 0.5);

  // Overhead proving-ground LED portals area-light approximation
  vec3 portalIrr = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    vec3 lp = vec3(float(i) * 4.2, clamp(pos.y, -5.2, 5.2), 4.30);
    vec3 d = lp - pos;
    float d2 = dot(d, d);
    vec3 ldir = d * inversesqrt(max(d2, 1e-4));
    float att = 1.0 / (1.0 + 0.22 * d2);
    portalIrr += vec3(1.15, 1.32, 1.65) * max(dot(nrm, ldir), 0.0) * att * step(pos.z, 4.30);
  }

  vec3 diffAlbedo = m.albedo * (1.0 - m.metalness);
  vec3 f0 = mix(vec3(0.04), m.albedo, m.metalness);
  vec3 h = normalize(sunDir + viewDir);
  float ndh = max(dot(nrm, h), 0.0);
  float r = max(m.coat > 0.0 ? mix(m.roughness, m.coatRough, m.coat * 0.65) : m.roughness, 0.035);
  float a2 = r * r * r * r;
  float denom = ndh * ndh * (a2 - 1.0) + 1.0;
  float ggx = a2 / max(3.14159265 * denom * denom, 1e-4);
  vec3 spec = f0 * min(ggx * 0.25, 18.0) * ndl * vec3(3.0, 2.75, 2.45);

  return m.emissive + diffAlbedo * (sunIrr + skyIrr + portalIrr) / 3.14159265 + spec;
}
`;

export const GBUFFER_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in float aMatId;

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform int uMatOverride;

out vec3 vWorldPos;
out vec3 vWorldNorm;
flat out int vMatId;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(uModel) * aNorm);
  vMatId = (uMatOverride >= 0) ? uMatOverride : int(aMatId + 0.5);
  gl_Position = uViewProj * wp;
}
`;

export const GBUFFER_FRAG = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vWorldNorm;
flat in int vMatId;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uPaintColor;

layout(location = 0) out vec4 outPosRough;
layout(location = 1) out vec4 outNormMat;
layout(location = 2) out vec4 outDirect;

${COMMON_MATERIAL_GLSL}

void main() {
  vec3 n = normalize(vWorldNorm);
  vec3 v = normalize(uCamPos - vWorldPos);
  SurfaceMat m = evalMaterial(vMatId, vWorldPos, uPaintColor);
  float effRough = (m.coat > 0.0) ? mix(m.roughness, m.coatRough, m.coat * 0.78) : m.roughness;
  vec3 direct = evalSurfaceDirectRadiance(vWorldPos, n, v, m, uSunDir);
  outPosRough = vec4(vWorldPos, effRough);
  outNormMat  = vec4(n, float(vMatId));
  outDirect   = vec4(direct, 1.0);
}
`;

// Dynamic GPU Slice Union Pass: composes the SINGLE World Global SDF Clip0 3D texture
// from baked static ProvingGround Clip0 + moving ControlVehicle (.sdfspace Body + 4x Rim + 4x Tyre).
// Zero analytical shapes! Every input is a real voxelized 3D .sdfspace texture!
export const SDF_UNION_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vUv;
uniform sampler3D uStaticClip0;
uniform sampler3D uStaticClip0Refl;
uniform sampler3D uBodySdf;
uniform sampler3D uRimSdf;
uniform sampler3D uTyreSdf;

uniform vec3 uClip0Min;
uniform vec3 uClip0Max;
uniform float uSliceZNorm;

uniform vec3 uBodySdfMin;
uniform vec3 uBodySdfInvSpan;
uniform vec3 uRimSdfMin;
uniform vec3 uRimSdfInvSpan;
uniform vec3 uTyreSdfMin;
uniform vec3 uTyreSdfInvSpan;

uniform mat4 uBodyLocalToWorld;
uniform mat4 uBodyWorldToLocal;
uniform mat4 uWheelWorldToLocal[4];
uniform vec3 uSunDir;
uniform vec3 uPaintColor;

layout(location = 0) out vec4 outSdfVoxel;
layout(location = 1) out vec4 outSdfRefl;

${COMMON_MATERIAL_GLSL}

float samplePartSdf(sampler3D tex, vec3 localPos, vec3 bmin, vec3 invSpan) {
  vec3 uvw = (localPos - bmin) * invSpan;
  if (any(lessThan(uvw, vec3(0.01))) || any(greaterThan(uvw, vec3(0.99)))) {
    return 1e5;
  }
  return texture(tex, uvw).r;
}

void main() {
  vec3 uvw = vec3(vUv, uSliceZNorm);
  vec4 base = texture(uStaticClip0, uvw);
  float baseRefl = texture(uStaticClip0Refl, uvw).r;
  float stDist = base.a;
  vec3 finalRad = base.rgb;
  float finalRefl = baseRefl;

  vec3 worldPos = mix(uClip0Min, uClip0Max, uvw);
  float carDist = 1e5;
  int hitMat = -1;

  // 1. ControlVehicle Body .sdfspace (88 x 64 x 36)
  vec3 bl = (uBodyWorldToLocal * vec4(worldPos, 1.0)).xyz;
  if (abs(bl.x) < 3.5 && abs(bl.y) < 1.7 && bl.z > -0.7 && bl.z < 1.9) {
    float dBody = samplePartSdf(uBodySdf, bl, uBodySdfMin, uBodySdfInvSpan);
    if (dBody < carDist) {
      carDist = dBody;
      hitMat = (bl.z > 0.56 && bl.x > -1.35 && bl.x < 1.15 && abs(bl.y) < 0.92) ? 7 : 6;
      if (abs(bl.x) > 3.00 && bl.z > 0.16 && bl.z < 0.44 && abs(bl.y) < 1.05) {
        hitMat = (bl.x > 0.0) ? 13 : 14;
      }
    }
  }

  // 2. 4x ControlVehicle Rim & Tyre .sdfspace
  for (int w = 0; w < 4; w++) {
    vec3 wl = (uWheelWorldToLocal[w] * vec4(worldPos, 1.0)).xyz;
    if (dot(wl, wl) < 0.85) {
      float dTyre = samplePartSdf(uTyreSdf, wl, uTyreSdfMin, uTyreSdfInvSpan);
      if (dTyre < carDist) {
        carDist = dTyre;
        hitMat = 11;
      }
      float dRim = samplePartSdf(uRimSdf, wl, uRimSdfMin, uRimSdfInvSpan);
      if (dRim < carDist) {
        carDist = dRim;
        hitMat = 10;
      }
    }
  }

  float finalDist = min(stDist, carDist);
  if (hitMat > 0 && carDist < stDist + 0.08) {
    float h = 0.07;
    vec3 localN = (hitMat == 10 || hitMat == 11)
      ? vec3(0.0, 1.0, 0.0)
      : normalize(vec3(
          samplePartSdf(uBodySdf, bl + vec3(h, 0.0, 0.0), uBodySdfMin, uBodySdfInvSpan) -
          samplePartSdf(uBodySdf, bl - vec3(h, 0.0, 0.0), uBodySdfMin, uBodySdfInvSpan),
          samplePartSdf(uBodySdf, bl + vec3(0.0, h, 0.0), uBodySdfMin, uBodySdfInvSpan) -
          samplePartSdf(uBodySdf, bl - vec3(0.0, h, 0.0), uBodySdfMin, uBodySdfInvSpan),
          samplePartSdf(uBodySdf, bl + vec3(0.0, 0.0, h), uBodySdfMin, uBodySdfInvSpan) -
          samplePartSdf(uBodySdf, bl - vec3(0.0, 0.0, h), uBodySdfMin, uBodySdfInvSpan)
        ));
    vec3 worldN = normalize(mat3(uBodyLocalToWorld) * localN);
    SurfaceMat m = evalMaterial(hitMat, worldPos, uPaintColor);
    vec3 cRad = min(evalSurfaceDirectRadiance(worldPos, worldN, vec3(0.0, 0.0, 1.0), m, uSunDir), vec3(24.0));
    float cRefl = clamp((m.metalness * 0.75 + m.coat * 0.45) * (1.0 - m.roughness), 0.0, 0.95);
    float wBlend = 1.0 - smoothstep(-0.04, 0.08, carDist - stDist);
    finalRad = mix(base.rgb, cRad, wBlend);
    finalRefl = mix(baseRefl, cRefl, wBlend);
  }

  outSdfVoxel = vec4(finalRad, finalDist);
  outSdfRefl  = vec4(finalRefl, 0.0, 0.0, 1.0);
}
`;

//========================================================================================================================
// PATH A: MULTI-BOUNCE GLOBAL DISTANCE FIELD REFLECTION PASS (2-Cascade 3D Clipmap + Optional Hi-Z Near Assist)
// ZERO analytical primitives — marches ONLY uClip0 & uClip1 3D voxel textures with trilinear narrow-band radiosity!
//========================================================================================================================
export const REFLECTION_SDF_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vUv;
uniform sampler2D uGPosRough;
uniform sampler2D uGNormMat;
uniform sampler2D uGDirect;

uniform sampler3D uClip0Linear;
uniform sampler3D uClip0Refl;
uniform sampler3D uClip1Linear;
uniform sampler3D uClip1Refl;

uniform vec3 uClip0Min;
uniform vec3 uClip0InvSpan;
uniform float uClip0Voxel;
uniform vec3 uClip1Min;
uniform vec3 uClip1InvSpan;
uniform float uClip1Voxel;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform int uMaxBounces;
uniform float uRoughnessCutoff;
uniform int uUseHiZAssist;

layout(location = 0) out vec4 outReflection;

${COMMON_MATERIAL_GLSL}

bool insideClip(vec3 p, vec3 bmin, vec3 invSpan, float margin) {
  vec3 u = (p - bmin) * invSpan;
  return all(greaterThan(u, vec3(margin))) && all(lessThan(u, vec3(1.0 - margin)));
}

float sampleGlobalSdfDistance(vec3 p, out int cascadeUsed) {
  if (insideClip(p, uClip0Min, uClip0InvSpan, 0.02)) {
    cascadeUsed = 0;
    return texture(uClip0Linear, (p - uClip0Min) * uClip0InvSpan).a;
  }
  if (insideClip(p, uClip1Min, uClip1InvSpan, 0.015)) {
    cascadeUsed = 1;
    return texture(uClip1Linear, (p - uClip1Min) * uClip1InvSpan).a;
  }
  cascadeUsed = 2;
  return 1e5;
}

vec3 evalGlobalSdfNormal(vec3 p, int cascade) {
  float h = (cascade == 0) ? uClip0Voxel * 0.95 : uClip1Voxel * 0.95;
  int c;
  const vec3 k0 = vec3( 1.0, -1.0, -1.0);
  const vec3 k1 = vec3(-1.0, -1.0,  1.0);
  const vec3 k2 = vec3(-1.0,  1.0, -1.0);
  const vec3 k3 = vec3( 1.0,  1.0,  1.0);
  vec3 g = k0 * sampleGlobalSdfDistance(p + k0 * h, c)
         + k1 * sampleGlobalSdfDistance(p + k1 * h, c)
         + k2 * sampleGlobalSdfDistance(p + k2 * h, c)
         + k3 * sampleGlobalSdfDistance(p + k3 * h, c);
  return normalize(g + vec3(0.0, 0.0, 1e-6));
}

void unpackSdfSurface(vec3 p, int cascade, out vec3 rad, out float refl) {
  if (cascade == 0) {
    vec3 u = clamp((p - uClip0Min) * uClip0InvSpan, vec3(0.004), vec3(0.996));
    rad  = texture(uClip0Linear, u).rgb;
    refl = texture(uClip0Refl, u).r;
  } else {
    vec3 u = clamp((p - uClip1Min) * uClip1InvSpan, vec3(0.004), vec3(0.996));
    rad  = texture(uClip1Linear, u).rgb;
    refl = texture(uClip1Refl, u).r;
  }
}

void main() {
  vec4 posRough = texture(uGPosRough, vUv);
  vec4 normMat  = texture(uGNormMat, vUv);
  int matId = int(normMat.w + 0.5);
  if (matId <= 0) {
    outReflection = vec4(0.0);
    return;
  }

  float roughness = posRough.w;
  if (roughness > uRoughnessCutoff) {
    outReflection = vec4(0.0);
    return;
  }

  vec3 origin = posRough.xyz;
  vec3 normal = normalize(normMat.xyz);
  vec3 viewDir = normalize(uCamPos - origin);
  vec3 rayDir = reflect(-viewDir, normal);
  if (dot(rayDir, normal) <= 0.0) {
    rayDir = normal;
  }

  vec3 totalRadiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  vec3 currOrigin = origin;
  vec3 currNormal = normal;
  float currRough = roughness;
  float firstHitDist = 80.0;

  // Optional short-range (0..1.35m) screen-space Hi-Z ray assist on Bounce 1 for razor-sharp car self-detail
  bool handledFirstBySsr = false;
  if (uUseHiZAssist == 1) {
    float stepLen = 0.075;
    for (int s = 1; s <= 16; s++) {
      float t = float(s) * stepLen;
      vec3 sp = currOrigin + currNormal * 0.03 + rayDir * t;
      vec4 clip = uViewProj * vec4(sp, 1.0);
      if (clip.w <= 0.05) break;
      vec2 suv = (clip.xy / clip.w) * 0.5 + 0.5;
      if (suv.x < 0.01 || suv.x > 0.99 || suv.y < 0.01 || suv.y > 0.99) break;
      vec4 gSample = texture(uGPosRough, suv);
      vec4 nSample = texture(uGNormMat, suv);
      if (nSample.w > 0.5) {
        float distSurf = length(sp - gSample.xyz);
        float viewDepthDiff = length(uCamPos - sp) - length(uCamPos - gSample.xyz);
        if (viewDepthDiff > -0.02 && viewDepthDiff < 0.16 && distSurf < 0.18) {
          vec3 hitRad = texture(uGDirect, suv).rgb;
          vec3 hitN = normalize(nSample.xyz);
          float hitRough = gSample.w;
          float hitRefl = clamp((1.0 - hitRough) * 0.72, 0.0, 0.90);
          firstHitDist = t;
          if (uMaxBounces <= 1 || hitRefl < 0.05) {
            totalRadiance += throughput * hitRad;
            outReflection = vec4(min(totalRadiance, vec3(60.0)), firstHitDist);
            return;
          }
          totalRadiance += throughput * hitRad * (1.0 - hitRefl * 0.65);
          throughput *= hitRefl;
          currOrigin = gSample.xyz;
          currNormal = hitN;
          rayDir = reflect(rayDir, hitN);
          currRough = clamp(sqrt(currRough * currRough + hitRough * hitRough), 0.04, 1.0);
          handledFirstBySsr = true;
          break;
        }
      }
    }
  }

  int startBounce = handledFirstBySsr ? 2 : 1;
  for (int bounce = 1; bounce <= 3; bounce++) {
    if (bounce < startBounce) continue;
    if (bounce > uMaxBounces) break;

    float bias = (bounce == 1) ? uClip0Voxel * 1.15 : uClip0Voxel * 1.35;
    vec3 ro = currOrigin + currNormal * bias;
    float t = 0.04;
    bool hit = false;
    int hitCascade = 0;
    vec3 hitPos = ro;

    // Sphere march the 2-Cascade 3D Global Distance Field (zero analytical shapes!)
    for (int stepIdx = 0; stepIdx < 64; stepIdx++) {
      vec3 p = ro + rayDir * t;
      int casc = 0;
      float d = sampleGlobalSdfDistance(p, casc);
      if (casc == 2) {
        break; // Escaped world Global SDF bounds -> Sky!
      }
      float vox = (casc == 0) ? uClip0Voxel : uClip1Voxel;
      float coneThresh = max(vox * 0.28, t * currRough * 0.025);
      if (d < coneThresh) {
        // 2-step continuous iso-surface root polish onto exact d = 0 level-set!
        p += rayDir * d;
        d = sampleGlobalSdfDistance(p, hitCascade);
        p += rayDir * d;
        hit = true;
        hitPos = p;
        if (bounce == 1) firstHitDist = length(p - ro);
        break;
      }
      t += max(d * 0.92, vox * 0.22);
      if (t > 28.0) break;
    }

    if (!hit) {
      totalRadiance += throughput * evalSkyAndClouds(rayDir, uSunDir);
      break;
    }

    vec3 hitN = evalGlobalSdfNormal(hitPos, hitCascade);
    if (dot(hitN, rayDir) > 0.0) hitN = -hitN;

    vec3 hitRad;
    float hitRefl;
    unpackSdfSurface(hitPos, hitCascade, hitRad, hitRefl);

    if (bounce == uMaxBounces || hitRefl < 0.04) {
      totalRadiance += throughput * hitRad;
      break;
    }

    float noV = max(dot(hitN, -rayDir), 0.02);
    float fresnel = hitRefl + (1.0 - hitRefl) * pow(1.0 - noV, 5.0) * 0.45;
    fresnel = clamp(fresnel, 0.0, 0.92);

    totalRadiance += throughput * hitRad * (1.0 - fresnel * 0.55);
    throughput *= fresnel;
    if (max(throughput.r, max(throughput.g, throughput.b)) < 0.025) break;

    currOrigin = hitPos;
    currNormal = hitN;
    rayDir = reflect(rayDir, hitN);
    currRough = clamp(currRough + 0.08, 0.04, 1.0);
  }

  outReflection = vec4(min(totalRadiance, vec3(60.0)), firstHitDist);
}
`;

//========================================================================================================================
// PATH B: MULTI-BOUNCE TWO-LEVEL SAH COMPUTE BVH REFLECTION PASS (Exact RayIntersection.slang GTX Non-RT Port!)
// Traverses TLAS + 6,018 Binned-SAH BLAS Nodes + 26,016 Instanced Triangles with Stack[48] + NEE Shadow Rays
//========================================================================================================================
export const REFLECTION_BVH_FRAG = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
uniform sampler2D uGPosRough;
uniform sampler2D uGNormMat;

uniform sampler2D uBvhNodes;   // RGBA32F width=2048: 2 texels per BoundingEntry
uniform sampler2D uBvhTris;    // RGBA32F width=2048: 4 texels per Triangle
uniform sampler2D uInstances;  // RGBA32F width=64:   9 texels per Instance (LocalToWorld[4], WorldToLocal[4], meta)

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uPaintColor;
uniform int uMaxBounces;
uniform float uRoughnessCutoff;
uniform int uTraceNeeShadows;

layout(location = 0) out vec4 outReflection;

${COMMON_MATERIAL_GLSL}

const int BVH_TEX_MASK  = 2047;
const int BVH_TEX_SHIFT = 11;

vec4 fetchNodeTexel(int texelIdx) {
  return texelFetch(uBvhNodes, ivec2(texelIdx & BVH_TEX_MASK, texelIdx >> BVH_TEX_SHIFT), 0);
}

vec4 fetchTriTexel(int texelIdx) {
  return texelFetch(uBvhTris, ivec2(texelIdx & BVH_TEX_MASK, texelIdx >> BVH_TEX_SHIFT), 0);
}

mat4 fetchInstanceMat(int instIdx, int matOffset) {
  int base = instIdx * 9 + matOffset;
  return mat4(
    texelFetch(uInstances, ivec2(base + 0, 0), 0),
    texelFetch(uInstances, ivec2(base + 1, 0), 0),
    texelFetch(uInstances, ivec2(base + 2, 0), 0),
    texelFetch(uInstances, ivec2(base + 3, 0), 0)
  );
}

int fetchInstanceMatOverride(int instIdx) {
  return int(texelFetch(uInstances, ivec2(instIdx * 9 + 8, 0), 0).x + 0.5) - 1;
}

vec3 unpackOctahedral(int packed20) {
  float u = float(packed20 & 1023) / 1023.0 * 2.0 - 1.0;
  float v = float((packed20 >> 10) & 1023) / 1023.0 * 2.0 - 1.0;
  vec3 n = vec3(u, v, 1.0 - abs(u) - abs(v));
  if (n.z < 0.0) {
    vec2 s = vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
    n.xy = (1.0 - abs(n.yx)) * s;
  }
  return normalize(n);
}

vec3 safeRecip(vec3 d) {
  return vec3(
    abs(d.x) < 1e-8 ? 1e8 : 1.0 / d.x,
    abs(d.y) < 1e-8 ? 1e8 : 1.0 / d.y,
    abs(d.z) < 1e-8 ? 1e8 : 1.0 / d.z
  );
}

float intersectAabb(vec3 orig, vec3 rcp, vec3 bmin, vec3 bmax, float limit) {
  vec3 t0 = (bmin - orig) * rcp;
  vec3 t1 = (bmax - orig) * rcp;
  vec3 lo = min(t0, t1);
  vec3 hi = max(t0, t1);
  float tNear = max(max(lo.x, lo.y), max(lo.z, 0.0));
  float tFar  = min(min(hi.x, hi.y), min(hi.z, limit));
  return (tNear <= tFar) ? tNear : 1e30;
}

struct BvhHit {
  bool hit;
  float t;
  vec3 pos;
  vec3 nrm;
  int matId;
};

// Exact Two-Level TLAS + BLAS closest-hit software traversal with stack[48] (RayIntersection.slang)
BvhHit traceSceneBvh(vec3 origin, vec3 dir, float tMin, float tMax) {
  BvhHit res;
  res.hit = false;
  res.t = tMax;
  res.pos = origin + dir * tMax;
  res.nrm = -dir;
  res.matId = 0;

  vec3 worldRcp = safeRecip(dir);
  int stack[48];
  int depth = 1;
  stack[0] = 0;
  int blasFloor = 999999;

  float nearest = tMax;
  int bestTri = -1;
  int bestInst = -1;
  vec2 bestUv = vec2(0.0);

  int currInst = -1;
  vec3 localOrig = origin;
  vec3 localDir = dir;
  vec3 localRcp = worldRcp;

  for (int stepIdx = 0; stepIdx < 320; stepIdx++) {
    if (depth <= 0) break;
    if (depth <= blasFloor) blasFloor = 999999;
    depth--;
    int nodeIdx = stack[depth];
    vec4 n0 = fetchNodeTexel(nodeIdx * 2);
    vec4 n1 = fetchNodeTexel(nodeIdx * 2 + 1);
    int leftOrFirst = int(n0.w + 0.5);
    int count = int(round(n1.w));

    if (blasFloor == 999999) {
      if (intersectAabb(origin, worldRcp, n0.xyz, n1.xyz, nearest) >= nearest) continue;
      if (count < 0) {
        currInst = (-count) - 1;
        mat4 w2l = fetchInstanceMat(currInst, 4);
        localOrig = (w2l * vec4(origin, 1.0)).xyz;
        localDir  = (w2l * vec4(dir, 0.0)).xyz;
        localRcp  = safeRecip(localDir);
        if (depth < 47) {
          blasFloor = depth;
          stack[depth++] = leftOrFirst;
        }
      } else {
        int left = leftOrFirst;
        int right = left + 1;
        vec4 ln0 = fetchNodeTexel(left * 2);  vec4 ln1 = fetchNodeTexel(left * 2 + 1);
        vec4 rn0 = fetchNodeTexel(right * 2); vec4 rn1 = fetchNodeTexel(right * 2 + 1);
        float ld = intersectAabb(origin, worldRcp, ln0.xyz, ln1.xyz, nearest);
        float rd = intersectAabb(origin, worldRcp, rn0.xyz, rn1.xyz, nearest);
        if (ld < rd) {
          if (rd < nearest && depth < 47) stack[depth++] = right;
          if (ld < nearest && depth < 47) stack[depth++] = left;
        } else {
          if (ld < nearest && depth < 47) stack[depth++] = left;
          if (rd < nearest && depth < 47) stack[depth++] = right;
        }
      }
    } else {
      if (intersectAabb(localOrig, localRcp, n0.xyz, n1.xyz, nearest) >= nearest) continue;
      if (count > 0) {
        for (int ti = 0; ti < count; ti++) {
          int triIdx = leftOrFirst + ti;
          int base = triIdx * 4;
          vec4 t0 = fetchTriTexel(base);
          vec3 e1 = fetchTriTexel(base + 1).xyz;
          vec3 e2 = fetchTriTexel(base + 2).xyz;
          vec3 pvec = cross(localDir, e2);
          float det = dot(e1, pvec);
          if (abs(det) < 1e-8) continue;
          float invDet = 1.0 / det;
          vec3 tvec = localOrig - t0.xyz;
          float u = dot(tvec, pvec) * invDet;
          if (u < 0.0 || u > 1.0) continue;
          vec3 qvec = cross(tvec, e1);
          float v = dot(localDir, qvec) * invDet;
          if (v < 0.0 || u + v > 1.0) continue;
          float travel = dot(e2, qvec) * invDet;
          if (travel >= tMin && travel < nearest) {
            nearest = travel;
            bestTri = triIdx;
            bestInst = currInst;
            bestUv = vec2(u, v);
          }
        }
      } else {
        int left = leftOrFirst;
        int right = left + 1;
        vec4 ln0 = fetchNodeTexel(left * 2);  vec4 ln1 = fetchNodeTexel(left * 2 + 1);
        vec4 rn0 = fetchNodeTexel(right * 2); vec4 rn1 = fetchNodeTexel(right * 2 + 1);
        float ld = intersectAabb(localOrig, localRcp, ln0.xyz, ln1.xyz, nearest);
        float rd = intersectAabb(localOrig, localRcp, rn0.xyz, rn1.xyz, nearest);
        if (ld < rd) {
          if (rd < nearest && depth < 47) stack[depth++] = right;
          if (ld < nearest && depth < 47) stack[depth++] = left;
        } else {
          if (ld < nearest && depth < 47) stack[depth++] = left;
          if (rd < nearest && depth < 47) stack[depth++] = right;
        }
      }
    }
  }

  if (bestTri >= 0) {
    int base = bestTri * 4;
    vec4 t0 = fetchTriTexel(base);
    vec4 t1 = fetchTriTexel(base + 1);
    vec4 t2 = fetchTriTexel(base + 2);
    vec4 t3 = fetchTriTexel(base + 3);
    vec3 na = unpackOctahedral(int(t1.w + 0.5));
    vec3 nb = unpackOctahedral(int(t2.w + 0.5));
    vec3 nc = unpackOctahedral(int(t3.w + 0.5));
    vec3 localN = normalize(na * (1.0 - bestUv.x - bestUv.y) + nb * bestUv.x + nc * bestUv.y);

    mat4 l2w = fetchInstanceMat(bestInst, 0);
    vec3 worldN = normalize(mat3(l2w) * localN);
    if (dot(worldN, dir) > 0.0) worldN = -worldN;

    int rawMat = int(t0.w + 0.5);
    int over = fetchInstanceMatOverride(bestInst);
    res.hit = true;
    res.t = nearest;
    res.pos = origin + dir * nearest;
    res.nrm = worldN;
    res.matId = (over >= 0) ? over : rawMat;
  }
  return res;
}

float traceSceneShadowBvh(vec3 origin, vec3 dir, float tMin, float tMax) {
  vec3 worldRcp = safeRecip(dir);
  int stack[48];
  int depth = 1;
  stack[0] = 0;
  int blasFloor = 999999;
  vec3 localOrig = origin;
  vec3 localDir = dir;
  vec3 localRcp = worldRcp;

  for (int stepIdx = 0; stepIdx < 240; stepIdx++) {
    if (depth <= 0) break;
    if (depth <= blasFloor) blasFloor = 999999;
    depth--;
    int nodeIdx = stack[depth];
    vec4 n0 = fetchNodeTexel(nodeIdx * 2);
    vec4 n1 = fetchNodeTexel(nodeIdx * 2 + 1);
    int leftOrFirst = int(n0.w + 0.5);
    int count = int(round(n1.w));

    if (blasFloor == 999999) {
      if (intersectAabb(origin, worldRcp, n0.xyz, n1.xyz, tMax) >= tMax) continue;
      if (count < 0) {
        int inst = (-count) - 1;
        mat4 w2l = fetchInstanceMat(inst, 4);
        localOrig = (w2l * vec4(origin, 1.0)).xyz;
        localDir  = (w2l * vec4(dir, 0.0)).xyz;
        localRcp  = safeRecip(localDir);
        if (depth < 47) {
          blasFloor = depth;
          stack[depth++] = leftOrFirst;
        }
      } else {
        if (depth < 46) {
          stack[depth++] = leftOrFirst + 1;
          stack[depth++] = leftOrFirst;
        }
      }
    } else {
      if (intersectAabb(localOrig, localRcp, n0.xyz, n1.xyz, tMax) >= tMax) continue;
      if (count > 0) {
        for (int ti = 0; ti < count; ti++) {
          int base = (leftOrFirst + ti) * 4;
          vec4 t0 = fetchTriTexel(base);
          int rawMat = int(t0.w + 0.5);
          if (rawMat == 7) continue; // Glass shadow skip (matches VehicleGlassFamily)
          vec3 e1 = fetchTriTexel(base + 1).xyz;
          vec3 e2 = fetchTriTexel(base + 2).xyz;
          vec3 pvec = cross(localDir, e2);
          float det = dot(e1, pvec);
          if (abs(det) < 1e-8) continue;
          float invDet = 1.0 / det;
          vec3 tvec = localOrig - t0.xyz;
          float u = dot(tvec, pvec) * invDet;
          if (u < 0.0 || u > 1.0) continue;
          vec3 qvec = cross(tvec, e1);
          float v = dot(localDir, qvec) * invDet;
          if (v < 0.0 || u + v > 1.0) continue;
          float travel = dot(e2, qvec) * invDet;
          if (travel >= tMin && travel < tMax) return 0.0;
        }
      } else {
        if (depth < 46) {
          stack[depth++] = leftOrFirst + 1;
          stack[depth++] = leftOrFirst;
        }
      }
    }
  }
  return 1.0;
}

void main() {
  vec4 posRough = texture(uGPosRough, vUv);
  vec4 normMat  = texture(uGNormMat, vUv);
  int matId = int(normMat.w + 0.5);
  if (matId <= 0) {
    outReflection = vec4(0.0);
    return;
  }

  float roughness = posRough.w;
  if (roughness > uRoughnessCutoff) {
    outReflection = vec4(0.0);
    return;
  }

  vec3 currOrigin = posRough.xyz;
  vec3 currNormal = normalize(normMat.xyz);
  vec3 viewDir = normalize(uCamPos - currOrigin);
  vec3 rayDir = reflect(-viewDir, currNormal);
  if (dot(rayDir, currNormal) <= 0.0) rayDir = currNormal;

  vec3 totalRadiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  float firstHitDist = 80.0;

  for (int bounce = 1; bounce <= 3; bounce++) {
    if (bounce > uMaxBounces) break;

    BvhHit hit = traceSceneBvh(currOrigin + currNormal * 0.004, rayDir, 0.003, 60.0);
    if (!hit.hit) {
      totalRadiance += throughput * evalSkyAndClouds(rayDir, uSunDir);
      break;
    }
    if (bounce == 1) firstHitDist = hit.t;

    SurfaceMat m = evalMaterial(hit.matId, hit.pos, uPaintColor);
    vec3 hitRad = evalSurfaceDirectRadiance(hit.pos, hit.nrm, -rayDir, m, uSunDir);

    // Optional NEE Shadow Rays (Sun + Portal Light) matching Frontier-OLD TraceMultiBounceReflection
    if (uTraceNeeShadows == 1 && bounce <= 2) {
      float sunVis = (dot(hit.nrm, uSunDir) > 0.0)
        ? traceSceneShadowBvh(hit.pos + hit.nrm * 0.005, uSunDir, 0.004, 40.0)
        : 0.0;
      vec3 portalTarget = vec3(0.0, clamp(hit.pos.y, -4.5, 4.5), 4.30);
      vec3 toPortal = portalTarget - hit.pos;
      float pDist = length(toPortal);
      float portalVis = (pDist > 0.1 && hit.pos.z < 4.2)
        ? traceSceneShadowBvh(hit.pos + hit.nrm * 0.005, toPortal / pDist, 0.004, pDist - 0.08)
        : 1.0;
      hitRad *= mix(0.28, 1.0, 0.65 * sunVis + 0.35 * portalVis);
    }

    float hitRefl = clamp((m.metalness * 0.75 + m.coat * 0.45) * (1.0 - m.roughness), 0.0, 0.95);
    if (bounce == uMaxBounces || hitRefl < 0.04) {
      totalRadiance += throughput * hitRad;
      break;
    }

    float noV = max(dot(hit.nrm, -rayDir), 0.02);
    float fresnel = hitRefl + (1.0 - hitRefl) * pow(1.0 - noV, 5.0) * 0.45;
    fresnel = clamp(fresnel, 0.0, 0.92);

    totalRadiance += throughput * hitRad * (1.0 - fresnel * 0.55);
    throughput *= fresnel;
    if (max(throughput.r, max(throughput.g, throughput.b)) < 0.025) break;

    currOrigin = hit.pos;
    currNormal = hit.nrm;
    rayDir = reflect(rayDir, hit.nrm);
  }

  outReflection = vec4(min(totalRadiance, vec3(60.0)), firstHitDist);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;

uniform sampler2D uGPosRough;
uniform sampler2D uGNormMat;
uniform sampler2D uGDirect;
uniform sampler2D uReflSdf;
uniform sampler2D uReflBvh;

uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uPaintColor;
uniform int uDisplayMode; // 0 = SDF, 1 = BVH, 2 = Split, 3 = Pixel Delta
uniform float uSplitX;

out vec4 outColor;

${COMMON_MATERIAL_GLSL}

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 shadeWithReflection(vec3 pos, vec3 nrm, int matId, vec3 direct, vec3 reflRad, vec3 viewDir) {
  SurfaceMat m = evalMaterial(matId, pos, uPaintColor);
  float noV = max(dot(nrm, viewDir), 0.02);
  vec3 f0 = mix(vec3(0.04), m.albedo, m.metalness);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - noV, 5.0);
  float coatF = m.coat * (0.04 + 0.96 * pow(1.0 - noV, 5.0));
  float roughFade = 1.0 - smoothstep(0.32, 0.78, m.roughness * (1.0 - m.coat * 0.7));
  vec3 reflWeight = clamp((fresnel * (1.0 - coatF) + vec3(coatF)) * roughFade, vec3(0.0), vec3(0.95));
  if (matId == 7) {
    // Cabin glass strong specular reflection over dark interior
    reflWeight = clamp(vec3(0.22 + 0.74 * pow(1.0 - noV, 3.2)), vec3(0.0), vec3(0.96));
  }
  return direct * (1.0 - reflWeight * 0.55) + reflRad * reflWeight;
}

void main() {
  vec4 normMat = texture(uGNormMat, vUv);
  int matId = int(normMat.w + 0.5);
  if (matId <= 0) {
    vec4 farH = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 rayDir = normalize(farH.xyz / farH.w - uCamPos);
    vec3 sky = evalSkyAndClouds(rayDir, uSunDir);
    outColor = vec4(pow(acesFilm(sky * 0.95), vec3(1.0 / 2.2)), 1.0);
    return;
  }

  vec3 pos = texture(uGPosRough, vUv).xyz;
  vec3 nrm = normalize(normMat.xyz);
  vec3 direct = texture(uGDirect, vUv).rgb;
  vec3 viewDir = normalize(uCamPos - pos);

  if (uDisplayMode == 0) {
    vec3 hdr = shadeWithReflection(pos, nrm, matId, direct, texture(uReflSdf, vUv).rgb, viewDir);
    outColor = vec4(pow(acesFilm(hdr * 0.95), vec3(1.0 / 2.2)), 1.0);
  } else if (uDisplayMode == 1) {
    vec3 hdr = shadeWithReflection(pos, nrm, matId, direct, texture(uReflBvh, vUv).rgb, viewDir);
    outColor = vec4(pow(acesFilm(hdr * 0.95), vec3(1.0 / 2.2)), 1.0);
  } else if (uDisplayMode == 2) {
    vec3 refl = (vUv.x < uSplitX) ? texture(uReflSdf, vUv).rgb : texture(uReflBvh, vUv).rgb;
    vec3 hdr = shadeWithReflection(pos, nrm, matId, direct, refl, viewDir);
    outColor = vec4(pow(acesFilm(hdr * 0.95), vec3(1.0 / 2.2)), 1.0);
  } else {
    vec3 cSdf = acesFilm(shadeWithReflection(pos, nrm, matId, direct, texture(uReflSdf, vUv).rgb, viewDir) * 0.95);
    vec3 cBvh = acesFilm(shadeWithReflection(pos, nrm, matId, direct, texture(uReflBvh, vUv).rgb, viewDir) * 0.95);
    vec3 diff = abs(cSdf - cBvh) * 4.0;
    outColor = vec4(pow(clamp(diff, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
  }
}
`;
