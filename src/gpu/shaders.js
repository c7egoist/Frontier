import { PALETTE_GLSL } from '../core/palettes.js';

export const COMMON_GLSL = `
precision highp sampler3D;
uniform int uMode;
uniform int uScalarMode;
uniform float uTime;
uniform float uFieldScale;
uniform float uDataScale;
uniform float uTracerRate;
uniform float uParticleLife;
uniform float uProceduralGlyphMotion;
uniform float uTerrainAmp;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform sampler3D uDataTex;
uniform vec3 uDataDims;
uniform vec3 uDataBoundsMin;
uniform vec3 uDataBoundsMax;
uniform vec2 uDataScalarRange;

const float PI = 3.14159265359;
const float GRADIENT_EPSILON = 0.16;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
float fieldScale() { return uFieldScale * uDataScale; }

float terrainBase(float x, float z) {
  float ridge = 0.82 * sin(0.24 * x + 0.3) * cos(0.19 * z - 0.4);
  float waves = 0.38 * sin(0.13 * x + 0.42 * z) + 0.22 * cos(0.51 * x - 0.27 * z);
  float hillA = 2.1 * exp(-(pow(x + 7.0, 2.0) + pow(z - 5.0, 2.0)) / 72.0);
  float hillB = 2.6 * exp(-(pow(x - 8.0, 2.0) + pow(z + 6.0, 2.0)) / 54.0);
  float basin = -1.2 * exp(-(x * x + z * z) / 42.0);
  return ridge + waves + hillA + hillB + basin;
}

float terrainHeight(vec2 xz, float amplitude) {
  return terrainBase(xz.x, xz.y) * amplitude;
}

vec2 terrainGradient(vec2 xz, float amplitude) {
  float e = GRADIENT_EPSILON;
  float dx = terrainBase(xz.x + e, xz.y) - terrainBase(xz.x - e, xz.y);
  float dz = terrainBase(xz.x, xz.y + e) - terrainBase(xz.x, xz.y - e);
  return vec2(dx, dz) * amplitude / (2.0 * e);
}

float rainfallValue(float x, float z, float time, float amplitude) {
  float h = terrainHeight(vec2(x, z), amplitude);
  return saturate(
    0.48
    + 0.27 * sin(0.18 * x + 0.13 * z + 0.11 * time)
    + 0.18 * cos(0.31 * z - 0.08 * time)
    - 0.055 * h
  );
}

float vegetationValue(float x, float z, float time, float amplitude) {
  float rain = rainfallValue(x, z, time, amplitude);
  vec2 gradient = terrainGradient(vec2(x, z), amplitude);
  float slope = saturate(length(gradient) / 1.35);
  float h = terrainHeight(vec2(x, z), amplitude);
  return saturate(
    rain * 0.72 + (1.0 - slope) * 0.26 - max(0.0, h) * 0.045
    + 0.06 * sin(0.7 * x + 0.5 * z)
  );
}

vec3 windField(vec3 p) {
  float r = length(p.xz) + 0.001;
  vec2 tangent = vec2(-p.z / r, p.x / r);
  vec2 radial = vec2(p.x / r, p.z / r);
  float swirl = 2.35 * exp(-r / 10.0);
  float obstacle = (1.0 - smoothstep(2.0, 5.6, r)) * 3.0;
  float gust = 0.45 * sin(0.24 * p.z + 0.35 * uTime) + 0.22 * sin(0.5 * p.x - 0.28 * uTime);
  float wake = smoothstep(2.0, 8.0, p.x) * exp(-abs(p.z) / 3.4) * sin(0.8 * p.x - 1.2 * uTime);
  return vec3(
    2.8 + gust + swirl * tangent.x + obstacle * radial.x + 0.35 * sin(0.3 * p.y + 0.2 * uTime),
    0.22 * sin(0.25 * p.x + 0.42 * uTime) + 0.14 * cos(0.3 * p.z - 0.2 * uTime)
      + 0.6 * exp(-r / 4.0) * (1.0 - p.y / 12.0),
    0.35 * cos(0.22 * p.x - 0.3 * uTime) + swirl * tangent.y + obstacle * radial.y + 1.1 * wake
  );
}

vec3 chargeContribution(vec3 p, vec3 c, float q) {
  vec3 d = p - c;
  float r2 = dot(d, d) + 1.8;
  return d * (q * 18.0 / (r2 * sqrt(r2)));
}

vec3 forceField(vec3 p) {
  vec3 v = vec3(0.18, 0.02 * sin(uTime * 0.25), 0.0);
  v += chargeContribution(p, vec3(-5.2, 5.4, 0.0), 1.35);
  v += chargeContribution(p, vec3(5.2, 5.4, 0.0), -1.15);
  float r = length(p.xz) + 0.001;
  float vortex = 1.1 * exp(-r / 9.0);
  v.x += (-p.z / r) * vortex;
  v.z += (p.x / r) * vortex;
  return v;
}

vec3 terrainField(vec3 p) {
  vec2 gradient = terrainGradient(p.xz, uTerrainAmp);
  vec2 slope = -gradient;
  float g = length(gradient) + 0.001;
  vec2 contour = vec2(-gradient.y / g, gradient.x / g);
  float r = length(p.xz) + 0.001;
  float basinSwirl = 0.85 * exp(-r / 8.5);
  float seasonal = 0.18 * sin(0.22 * p.x + 0.16 * uTime);
  return vec3(
    slope.x * 1.55 + contour.x * (0.72 + seasonal) + (-p.z / r) * basinSwirl,
    -0.075 * dot(slope, slope) + 0.16 * sin(0.32 * p.x + 0.21 * uTime),
    slope.y * 1.55 + contour.y * (0.72 + seasonal) + (p.x / r) * basinSwirl
  );
}

vec4 fetchData(ivec3 cell) {
  ivec3 hi = ivec3(uDataDims) - ivec3(1);
  return texelFetch(uDataTex, clamp(cell, ivec3(0), hi), 0);
}

vec4 sampleData(vec3 p) {
  vec3 span = max(uDataBoundsMax - uDataBoundsMin, vec3(0.000001));
  vec3 q = clamp((p - uDataBoundsMin) / span, vec3(0.0), vec3(1.0));
  vec3 g = q * max(uDataDims - vec3(1.0), vec3(0.0));
  ivec3 i0 = clamp(ivec3(floor(g)), ivec3(0), ivec3(uDataDims) - ivec3(1));
  ivec3 i1 = min(i0 + ivec3(1), ivec3(uDataDims) - ivec3(1));
  vec3 f = fract(g);
  vec4 c000 = fetchData(ivec3(i0.x, i0.y, i0.z));
  vec4 c100 = fetchData(ivec3(i1.x, i0.y, i0.z));
  vec4 c010 = fetchData(ivec3(i0.x, i1.y, i0.z));
  vec4 c110 = fetchData(ivec3(i1.x, i1.y, i0.z));
  vec4 c001 = fetchData(ivec3(i0.x, i0.y, i1.z));
  vec4 c101 = fetchData(ivec3(i1.x, i0.y, i1.z));
  vec4 c011 = fetchData(ivec3(i0.x, i1.y, i1.z));
  vec4 c111 = fetchData(ivec3(i1.x, i1.y, i1.z));
  vec4 x00 = mix(c000, c100, f.x);
  vec4 x10 = mix(c010, c110, f.x);
  vec4 x01 = mix(c001, c101, f.x);
  vec4 x11 = mix(c011, c111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

vec3 sampleField(vec3 p) {
  if (uMode == 0) return windField(p);
  if (uMode == 1) return forceField(p);
  if (uMode == 2) return terrainField(p);
  return sampleData(p).xyz;
}

vec3 sampleFieldScaled(vec3 p) {
  return sampleField(p) * fieldScale();
}

float pressureValue(vec3 p, vec3 v) {
  if (uMode == 1) {
    float r1 = length(p - vec3(-5.2, 5.4, 0.0)) + 2.0;
    float r2 = length(p - vec3(5.2, 5.4, 0.0)) + 2.0;
    return saturate(0.5 + 0.055 * (12.0 / r1 - 12.0 / r2));
  }
  if (uMode == 2) {
    return saturate(0.5 - 0.12 * terrainHeight(p.xz, uTerrainAmp) + 0.08 * sin(0.18 * p.x + 0.15 * uTime));
  }
  return saturate(0.5 + 0.1 * (
    -v.x + 2.0 * sin(0.18 * p.x + 0.25 * uTime)
    + 1.2 * cos(0.2 * p.z - 0.15 * uTime)
    - 0.8 * exp(-dot(p.xz, p.xz) / 25.0)
  ));
}

vec3 fieldCurl(vec3 p) {
  float h = 0.32;
  vec3 fxp = sampleField(p + vec3(h, 0.0, 0.0));
  vec3 fxm = sampleField(p - vec3(h, 0.0, 0.0));
  vec3 fyp = sampleField(p + vec3(0.0, h, 0.0));
  vec3 fym = sampleField(p - vec3(0.0, h, 0.0));
  vec3 fzp = sampleField(p + vec3(0.0, 0.0, h));
  vec3 fzm = sampleField(p - vec3(0.0, 0.0, h));
  float dvzdy = (fyp.z - fym.z) / (2.0 * h);
  float dvydz = (fzp.y - fzm.y) / (2.0 * h);
  float dvxdz = (fzp.x - fzm.x) / (2.0 * h);
  float dvzdx = (fxp.z - fxm.z) / (2.0 * h);
  float dvydx = (fxp.y - fxm.y) / (2.0 * h);
  float dvxdy = (fyp.x - fym.x) / (2.0 * h);
  return vec3(dvzdy - dvydz, dvxdz - dvzdx, dvydx - dvxdy);
}

float fieldDivergence(vec3 p) {
  float h = 0.32;
  vec3 fxp = sampleField(p + vec3(h, 0.0, 0.0));
  vec3 fxm = sampleField(p - vec3(h, 0.0, 0.0));
  vec3 fyp = sampleField(p + vec3(0.0, h, 0.0));
  vec3 fym = sampleField(p - vec3(0.0, h, 0.0));
  vec3 fzp = sampleField(p + vec3(0.0, 0.0, h));
  vec3 fzm = sampleField(p - vec3(0.0, 0.0, h));
  return (fxp.x - fxm.x + fyp.y - fym.y + fzp.z - fzm.z) / (2.0 * h);
}

float scalarNormalized(vec3 p, vec3 v) {
  float scale = fieldScale();
  if (uScalarMode == 0) return saturate(length(v) * scale / 6.0);
  if (uScalarMode == 1) {
    if (uMode == 3) {
      float raw = sampleData(p).w;
      return saturate((raw - uDataScalarRange.x) / max(uDataScalarRange.y - uDataScalarRange.x, 0.000001));
    }
    return pressureValue(p, v);
  }
  if (uScalarMode == 2) return saturate(length(fieldCurl(p)) * scale / 5.0);
  if (uScalarMode == 3) return saturate(0.5 + fieldDivergence(p) * scale * 0.16);
  if (uScalarMode == 4) return saturate((terrainHeight(p.xz, uTerrainAmp) + 2.2) / 8.5);
  if (uScalarMode == 5) return rainfallValue(p.x, p.z, uTime, uTerrainAmp);
  return vegetationValue(p.x, p.z, uTime, uTerrainAmp);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 animatedParticlePosition(vec3 anchor, float seed, out float fade) {
  float rate = max(uTracerRate, 0.1);
  float travel = fract(uTime * 0.18 * rate + seed);
  vec3 p = anchor;
  vec3 v0 = sampleFieldScaled(p);
  p += normalize(v0 + vec3(0.0001)) * travel * 4.2;
  vec3 v1 = sampleFieldScaled(p);
  p += normalize(v1 + vec3(0.0001)) * travel * 2.0;
  p.xz = mod(p.xz + vec2(16.0), vec2(32.0)) - vec2(16.0);
  p.y = clamp(p.y, terrainHeight(p.xz, uTerrainAmp) + 0.35, uBoundsMax.y - 0.4);
  fade = smoothstep(0.0, 0.075, travel) * (1.0 - smoothstep(0.90, 1.0, travel));
  return p;
}

${PALETTE_GLSL}
`;

export const ARROW_VERTEX = `
${COMMON_GLSL}
uniform sampler2D uPositionTexture;
uniform float uGlyphAdvection;
uniform float uGlyphScale;
uniform float uSliceY;
uniform float uSliceWidth;
uniform float uSliceEnabled;
uniform float uGlyphOpacity;
in vec3 aGridPos;
in vec2 aParticleUv;
in float aSeed;
out vec3 vColor;
out float vAlpha;
out float vShade;

mat3 basisFromDirection(vec3 direction) {
  vec3 helper = abs(direction.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(helper, direction));
  vec3 forward = cross(direction, right);
  return mat3(right, direction, forward);
}

void main() {
  vec4 particle = texture(uPositionTexture, aParticleUv);
  float proceduralFade = 1.0;
  vec3 fallback = aGridPos;
  if (uProceduralGlyphMotion > 0.5) {
    fallback = animatedParticlePosition(aGridPos, aSeed, proceduralFade);
  }
  vec3 origin = mix(fallback, particle.xyz, uGlyphAdvection);
  vec3 v = sampleField(origin);
  float speed = length(v) * fieldScale();
  float strength = saturate(speed / 6.0);
  vec3 direction = normalize(v + vec3(0.0001, 0.0001, 0.0001));
  mat3 basis = basisFromDirection(direction);
  float arrowLength = (0.38 + 1.35 * strength) * uGlyphScale;
  float arrowWidth = (0.72 + 0.24 * strength) * uGlyphScale;
  vec3 local = position;
  local.y *= arrowLength;
  local.xz *= arrowWidth;
  vec3 world = origin + basis * local;
  float slice = mix(1.0, 1.0 - smoothstep(uSliceWidth, uSliceWidth + 0.9, abs(origin.y - uSliceY)), uSliceEnabled);
  float obstacleMask = 1.0;
  if (uMode == 0 && length(origin.xz) < 2.2 && origin.y < 5.5) obstacleMask = 0.0;
  float pulse = mix(1.0, 0.86 + 0.14 * sin(uTime * 1.8 + aSeed * PI * 2.0), uProceduralGlyphMotion);
  vec3 scalarColor = paletteColor(uScalarMode, scalarNormalized(origin, v));
  vec3 magnitudeTone = paletteColor(0, 0.20 + strength * 0.80);
  vColor = uScalarMode == 0 ? scalarColor : mix(magnitudeTone, scalarColor, 0.62);
  float birth = smoothstep(0.0, 0.35, particle.w);
  float death = 1.0 - smoothstep(uParticleLife * 0.78, uParticleLife, particle.w);
  float lifeFade = mix(1.0, birth * death, uGlyphAdvection);
  vAlpha = saturate(speed / 1.4) * slice * obstacleMask * pulse * uGlyphOpacity * lifeFade * proceduralFade;
  vShade = 0.68 + 0.32 * saturate(dot(direction, normalize(vec3(-0.3, 0.85, 0.4))) * 0.5 + 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

export const ARROW_FRAGMENT = `
${COMMON_GLSL}
in vec3 vColor;
in float vAlpha;
in float vShade;
out vec4 fragColor;
void main() {
  if (vAlpha < 0.015) discard;
  fragColor = vec4(vColor * vShade, vAlpha);
}
`;

export const TERRAIN_VERTEX = `
${COMMON_GLSL}
out vec3 vWorld;
out vec3 vNormal;
out float vHeight;
void main() {
  vec3 p = position;
  float h = terrainHeight(p.xz, uTerrainAmp);
  vec2 gradient = terrainGradient(p.xz, uTerrainAmp);
  p.y = h;
  vWorld = p;
  vNormal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
  vHeight = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const TERRAIN_FRAGMENT = `
${COMMON_GLSL}
uniform float uTerrainOpacity;
uniform float uShowGrid;
uniform float uShowContours;
uniform float uShowRain;
uniform float uShowVegetation;
in vec3 vWorld;
in vec3 vNormal;
in float vHeight;
out vec4 fragColor;

void main() {
  vec3 v = sampleField(vWorld);
  float scalar = scalarNormalized(vWorld, v);
  vec3 base = paletteColor(uScalarMode, scalar);
  float light = clamp(dot(vNormal, normalize(vec3(-0.35, 0.9, 0.28))), 0.0, 1.0);
  vec3 color = base * (0.30 + 0.64 * light);

  vec2 gridCoord = vWorld.xz * 0.5;
  vec2 gridDistance = abs(fract(gridCoord - 0.5) - 0.5) / max(fwidth(gridCoord), vec2(0.0001));
  float grid = 1.0 - min(min(gridDistance.x, gridDistance.y), 1.0);
  color += vec3(0.10, 0.18, 0.17) * grid * uShowGrid * 0.22;

  float contourPhase = vHeight * 1.35;
  float contourDistance = abs(fract(contourPhase) - 0.5);
  float contour = 1.0 - smoothstep(0.0, fwidth(contourPhase) * 1.8, contourDistance);
  color += vec3(0.72, 0.88, 0.70) * contour * uShowContours * 0.13;

  float rain = rainfallValue(vWorld.x, vWorld.z, uTime, uTerrainAmp);
  float vegetation = vegetationValue(vWorld.x, vWorld.z, uTime, uTerrainAmp);
  color += vec3(0.10, 0.34, 0.54) * rain * uShowRain * 0.16;
  color += vec3(0.18, 0.50, 0.12) * vegetation * uShowVegetation * 0.20;

  float edge = max(abs(vWorld.x), abs(vWorld.z));
  float fade = 1.0 - smoothstep(13.8, 16.0, edge);
  float radial = 1.0 - smoothstep(14.0, 22.0, length(vWorld.xz));
  float visibility = uTerrainOpacity * fade * radial;
  color = mix(vec3(0.018, 0.030, 0.034), color, visibility);
  fragColor = vec4(color, 1.0);
}
`;

export const COMPUTE_VERTEX = `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const COMPUTE_FRAGMENT = `
${COMMON_GLSL}
uniform sampler2D uState;
uniform sampler2D uSpawnTexture;
uniform float uDelta;
uniform float uReset;
uniform float uSeed;
in vec2 vUv;
out vec4 fragColor;

vec3 respawnPosition(vec2 uv, float salt) {
  vec3 base = texture(uSpawnTexture, uv).xyz;
  vec3 r = vec3(
    hash12(uv + vec2(salt, 0.13)),
    hash12(uv + vec2(0.71, salt + 0.37)),
    hash12(uv + vec2(salt + 0.19, 0.83))
  );
  vec3 p = base + (r - 0.5) * vec3(0.34, 0.20, 0.34);
  p = clamp(p, uBoundsMin + vec3(0.4, 0.3, 0.4), uBoundsMax - vec3(0.4, 0.4, 0.4));
  p.y = max(p.y, terrainHeight(p.xz, uTerrainAmp) + 0.35);
  return p;
}

void main() {
  vec4 state = texture(uState, vUv);
  if (uReset > 0.5) {
    float age = hash12(vUv + vec2(uSeed, 0.41)) * uParticleLife * 0.85;
    fragColor = vec4(respawnPosition(vUv, uSeed), age);
    return;
  }
  vec3 p = state.xyz;
  float age = state.w;
  vec3 v0 = sampleFieldScaled(p) * uTracerRate;
  vec3 mid = p + v0 * uDelta * 0.5;
  vec3 v1 = sampleFieldScaled(mid) * uTracerRate;
  p += v1 * uDelta;
  age += uDelta;
  float floorHeight = terrainHeight(p.xz, uTerrainAmp) + 0.28;
  bool outside = any(lessThan(p, uBoundsMin)) || any(greaterThan(p, uBoundsMax)) || p.y < floorHeight;
  if (outside || age > uParticleLife) {
    p = respawnPosition(vUv, uSeed + uTime * 0.013);
    age = 0.0;
  }
  fragColor = vec4(p, age);
}
`;

export const COPY_FRAGMENT = `
uniform sampler2D uInitial;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texture(uInitial, vUv);
}
`;

export const POINTS_VERTEX = `
${COMMON_GLSL}
uniform sampler2D uPositionTexture;
uniform float uPixelRatio;
uniform float uPointOpacity;
in vec2 aUv;
out vec3 vColor;
out float vAlpha;
void main() {
  vec4 state = texture(uPositionTexture, aUv);
  float motionFade = 1.0;
  vec3 p = uProceduralGlyphMotion > 0.5
    ? animatedParticlePosition(state.xyz, hash12(aUv), motionFade)
    : state.xyz;
  vec3 v = sampleField(p);
  float speed = length(v) * fieldScale();
  vec3 scalarColor = paletteColor(uScalarMode, scalarNormalized(p, v));
  vec3 magnitudeTone = paletteColor(0, 0.20 + saturate(speed / 6.0) * 0.80);
  vColor = uScalarMode == 0 ? scalarColor : mix(magnitudeTone, scalarColor, 0.55);
  vAlpha = motionFade * uPointOpacity;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float perspective = 30.0 / max(1.0, -mv.z);
  gl_PointSize = clamp((2.3 + 4.2 * saturate(speed / 6.0)) * uPixelRatio * perspective, 1.5, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const POINTS_FRAGMENT = `
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float glow = exp(-d * 2.5);
  vec3 color = vColor * glow * 1.65 + vec3(0.025, 0.045, 0.038) * glow;
  fragColor = vec4(color, vAlpha * glow);
}
`;

export const TRAILS_VERTEX = `
${COMMON_GLSL}
uniform sampler2D uPositionTexture;
uniform float uTrailLength;
uniform float uTrailOpacity;
in vec2 aUv;
in float aEnd;
out vec3 vColor;
out float vAlpha;
void main() {
  vec4 state = texture(uPositionTexture, aUv);
  float motionFade = 1.0;
  vec3 p = uProceduralGlyphMotion > 0.5
    ? animatedParticlePosition(state.xyz, hash12(aUv), motionFade)
    : state.xyz;
  vec3 v = sampleField(p);
  vec3 scaled = v * fieldScale();
  float speed = length(scaled);
  vec3 direction = normalize(scaled + vec3(0.0001));
  p -= direction * min(speed * 0.14, 1.4) * uTrailLength * aEnd;
  vec3 scalarColor = paletteColor(uScalarMode, scalarNormalized(p, v));
  vec3 magnitudeTone = paletteColor(0, 0.20 + saturate(speed / 6.0) * 0.80);
  vColor = uScalarMode == 0 ? scalarColor : mix(magnitudeTone, scalarColor, 0.55);
  vAlpha = uTrailOpacity * motionFade * (1.0 - aEnd * 0.62) * saturate(speed / 1.6);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const TRAILS_FRAGMENT = `
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColor, vAlpha);
}
`;

export const RAIN_VERTEX = `
${COMMON_GLSL}
uniform float uRainOpacity;
in vec2 aOffset;
in float aSeed;
out vec3 vColor;
out float vAlpha;
void main() {
  float ground = terrainHeight(aOffset, uTerrainAmp);
  float cycle = max(2.0, uBoundsMax.y - ground);
  float fall = mod(uTime * (5.0 + aSeed * 3.0) + aSeed * 37.0, cycle);
  float y = uBoundsMax.y - fall;
  vec3 p = vec3(aOffset.x + position.x, y + position.y, aOffset.y + position.z);
  float rain = rainfallValue(aOffset.x, aOffset.y, uTime, uTerrainAmp);
  vColor = paletteColor(5, rain);
  vAlpha = uRainOpacity * (0.18 + 0.5 * rain) * smoothstep(0.0, 1.2, y - ground);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const RAIN_FRAGMENT = `
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColor, vAlpha);
}
`;

export const VEGETATION_VERTEX = `
${COMMON_GLSL}
uniform float uVegetationOpacity;
in vec2 aOffset;
in float aSeed;
out vec3 vColor;
out float vAlpha;
void main() {
  float vegetation = vegetationValue(aOffset.x, aOffset.y, uTime, uTerrainAmp);
  float angle = aSeed * PI * 2.0;
  float c = cos(angle);
  float s = sin(angle);
  vec3 local = position;
  local.xz = mat2(c, -s, s, c) * local.xz;
  local.xz *= 0.8 + aSeed * 0.6;
  local.y *= (0.22 + 0.72 * vegetation) * (0.7 + aSeed * 0.6);
  vec3 p = vec3(aOffset.x, terrainHeight(aOffset, uTerrainAmp) + 0.025, aOffset.y) + local;
  vColor = paletteColor(6, vegetation);
  vAlpha = uVegetationOpacity * smoothstep(0.25, 0.68, vegetation);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const VEGETATION_FRAGMENT = `
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  if (vAlpha < 0.01) discard;
  fragColor = vec4(vColor, vAlpha);
}
`;
