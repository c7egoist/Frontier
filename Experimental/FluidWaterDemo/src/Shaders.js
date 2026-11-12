// GLSL ES 3.00 shaders for 2.5D Shallow-Water + Coastal Shore Bathymetry
// + Mass-Conserving Advected Continuum Foam + Analytical Voronoi Plateau-Border Surface.
// Zero foam textures. Zero fake particle sprites.

export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const COMMON_GLSL = `
precision highp float;

vec4 sampleBilinear(sampler2D tex, vec2 uv, vec2 res) {
  vec2 clampedUv = clamp(uv, vec2(0.5) / res, 1.0 - vec2(0.5) / res);
  vec2 st = clampedUv * res - 0.5;
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 invRes = 1.0 / res;
  vec4 c00 = texture(tex, (i + vec2(0.5, 0.5)) * invRes);
  vec4 c10 = texture(tex, (i + vec2(1.5, 0.5)) * invRes);
  vec4 c01 = texture(tex, (i + vec2(0.5, 1.5)) * invRes);
  vec4 c11 = texture(tex, (i + vec2(1.5, 1.5)) * invRes);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

// Analytical coastal cove bathymetry shared across SWE solver, seabed mesh, and water refraction
float shoreBedY(
  vec2 worldXZ,
  vec2 boundsXZ,
  float waterDepth,
  float shoreEnabled,
  float shoreWidth,
  float shoreSlope,
  float shoreCurve
) {
  if (shoreEnabled < 0.5) return -waterDepth;
  float halfW = boundsXZ.x * 0.5;
  float halfL = max(8.0, boundsXZ.y * 0.5);
  float coveOffset = shoreCurve * (
    0.62 * sin((worldXZ.y / halfL) * 3.14159265 * 1.45) +
    0.38 * cos((worldXZ.y / halfL) * 3.14159265 * 2.7 + 0.6)
  );
  float beachStartX = halfW - shoreWidth + coveOffset;
  float distPastStart = worldXZ.x - beachStartX;
  if (distPastStart <= 0.0) {
    float lead = max(0.0, 1.0 + distPastStart / 6.0);
    return -waterDepth + lead * lead * 0.35;
  }
  float slopeRise = distPastStart * shoreSlope * 1.65;
  return min(2.2, -waterDepth + 0.35 + slopeRise);
}

float gerstnerSwell(vec2 worldXZ, float t, float amp, float freqScale, float chop, vec2 windDir) {
  if (amp <= 0.0001) return 0.0;
  float freq = freqScale * 0.24;
  vec2 d1 = normalize(windDir);
  vec2 p1 = vec2(-d1.y, d1.x);
  float spd = sqrt(9.81 / max(0.08, freq));

  float ph1 = dot(worldXZ, d1) * freq - t * spd * freq * 1.1;
  vec2 d2 = normalize(d1 * 0.8 + p1 * 0.6);
  float ph2 = dot(worldXZ, d2) * (freq * 1.65) - t * spd * freq * 1.45;
  vec2 d3 = normalize(d1 * 0.65 - p1 * 0.76);
  float ph3 = dot(worldXZ, d3) * (freq * 2.45) - t * spd * freq * 1.8;

  return amp * (0.62 * sin(ph1) + 0.14 * sin(2.0 * ph1))
       + amp * chop * (0.34 * sin(ph2) + 0.22 * sin(ph3));
}

// Smooth V-hull SDF in world XZ space
vec4 boatHullSDF(vec2 worldXZ, vec2 boatPos, float boatYaw, vec2 boatHalfLenBeam) {
  vec2 rel = worldXZ - boatPos;
  float c = cos(boatYaw);
  float s = sin(boatYaw);
  float lx = rel.x * c + rel.y * s;
  float lz = -rel.x * s + rel.y * c;

  float halfLen = max(0.5, boatHalfLenBeam.x);
  float halfBeam = max(0.3, boatHalfLenBeam.y);

  float u = lx / halfLen;
  float clampedU = clamp(u, -1.0, 1.0);
  float beamProfile = pow(max(0.02, 1.0 - max(0.0, clampedU) * 0.92), 0.52) * (clampedU < -0.7 ? 0.85 : 1.0);
  float localHalfB = halfBeam * beamProfile;

  float dx = max(abs(lx) - halfLen, 0.0);
  float dz = abs(lz) - localHalfB;
  float outside = length(vec2(dx, max(dz, 0.0)));
  float inside = min(max(abs(lx) - halfLen, dz), 0.0);
  float sdf = outside + inside;

  float vNorm = clamp(abs(lz) / max(0.08, localHalfB), 0.0, 1.5);
  float bowWeight = smoothstep(-0.15, 0.92, u);
  return vec4(sdf, u, vNorm, bowWeight);
}
`;

// Pass 1: Compute Vorticity w = dv/dx - du/dz
export const VORTICITY_FRAG = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uWaterTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 dx = uBoundsXZ / uSimRes;
  vec2 inv2dx = 0.5 / dx;
  vec2 stepUv = 1.0 / uSimRes;

  float vR = texture(uWaterTex, clamp(vUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).b;
  float vL = texture(uWaterTex, clamp(vUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).b;
  float uT = texture(uWaterTex, clamp(vUv + vec2(0.0, stepUv.y), 0.0, 1.0)).g;
  float uB = texture(uWaterTex, clamp(vUv - vec2(0.0, stepUv.y), 0.0, 1.0)).g;

  float curl = (vR - vL) * inv2dx.x - (uT - uB) * inv2dx.y;
  fragColor = vec4(curl, 0.0, 0.0, 1.0);
}`;

// Pass 2: 2.5D Shallow-Water Equations + Coastal Shoaling + Vorticity Confinement + Hull Coupling
export const SWE_STEP_FRAG = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uWaterTex;
uniform sampler2D uVortTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
uniform float uDt;
uniform float uWaveSpeed;
uniform float uWaterDepth;
uniform float uDamping;
uniform float uVorticityStrength;
uniform int uBoundaryMode;

// Shore bathymetry
uniform float uShoreEnabled;
uniform float uShoreWidth;
uniform float uShoreSlope;
uniform float uShoreCurve;

// Boat
uniform float uBoatVisible;
uniform vec2 uBoatPos;
uniform vec2 uBoatVel;
uniform float uBoatYaw;
uniform float uBoatY;
uniform vec2 uBoatHalfLenBeam;
uniform float uBoatDraft;
uniform float uWakeCoupling;
uniform float uPropWash;

// Brush
uniform float uBrushActive;
uniform vec2 uBrushWorldXZ;
uniform vec2 uBrushVel;
uniform float uBrushRadius;
uniform float uBrushStrength;

uniform vec2 uWindVec;
uniform float uStepPhase;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 dx = uBoundsXZ / uSimRes;
  vec2 inv2dx = 0.5 / dx;
  vec2 stepUv = 1.0 / uSimRes;
  vec2 worldXZ = (vUv - 0.5) * uBoundsXZ;

  vec4 state = texture(uWaterTex, vUv);
  float h = state.r;
  float u = state.g;
  float v = state.b;
  float prevHullImp = state.a;

  float bedY = shoreBedY(worldXZ, uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve);
  float localDepth = max(0.0, h - bedY);
  float depthRatio = clamp(localDepth / max(0.5, uWaterDepth), 0.04, 1.0);
  float wetMask = smoothstep(-0.08, 0.14, h - bedY);

  if (uStepPhase < 0.5) {
    float hR = texture(uWaterTex, clamp(vUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).r;
    float hL = texture(uWaterTex, clamp(vUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).r;
    float hT = texture(uWaterTex, clamp(vUv + vec2(0.0, stepUv.y), 0.0, 1.0)).r;
    float hB = texture(uWaterTex, clamp(vUv - vec2(0.0, stepUv.y), 0.0, 1.0)).r;

    float dhdx = (hR - hL) * inv2dx.x;
    float dhdz = (hT - hB) * inv2dx.y;

    // Shoaling: local wave celerity slows smoothly as depth decreases near beach!
    float cSq = (uWaveSpeed * uWaveSpeed) * mix(0.22, 1.0, depthRatio);
    u -= cSq * dhdx * uDt;
    v -= cSq * dhdz * uDt;

    // Vorticity confinement in deep/mid water
    float wR = abs(texture(uVortTex, clamp(vUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).r);
    float wL = abs(texture(uVortTex, clamp(vUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).r);
    float wT = abs(texture(uVortTex, clamp(vUv + vec2(0.0, stepUv.y), 0.0, 1.0)).r);
    float wB = abs(texture(uVortTex, clamp(vUv - vec2(0.0, stepUv.y), 0.0, 1.0)).r);
    float wC = texture(uVortTex, vUv).r;
    vec2 gradW = vec2((wR - wL) * inv2dx.x, (wT - wB) * inv2dx.y);
    float gLen = length(gradW) + 1e-5;
    vec2 nW = gradW / gLen;
    vec2 vortForce = vec2(nW.y, -nW.x) * wC * uVorticityStrength * wetMask;
    u += vortForce.x * uDt;
    v += vortForce.y * uDt;

    vec2 backUv = vUv - vec2(u, v) * uDt / uBoundsXZ;
    vec4 backState = sampleBilinear(uWaterTex, backUv, uSimRes);
    u = mix(u, backState.g, 0.14);
    v = mix(v, backState.b, 0.14);

    u += uWindVec.x * 0.014 * uDt * wetMask;
    v += uWindVec.y * 0.014 * uDt * wetMask;

    if (uBoatVisible > 0.5) {
      vec4 sdfData = boatHullSDF(worldXZ, uBoatPos, uBoatYaw, uBoatHalfLenBeam);
      float sdf = sdfData.x;
      float bowW = sdfData.w;
      float boatSpeed = length(uBoatVel);

      if (sdf < 0.75 && boatSpeed > 0.15) {
        vec2 fwd = vec2(cos(uBoatYaw), sin(uBoatYaw));
        vec2 rel = worldXZ - uBoatPos;
        vec2 right = vec2(-fwd.y, fwd.x);
        float latSign = sign(dot(rel, right) + 1e-4);
        float hullBand = exp(-max(sdf, 0.0) * max(sdf, 0.0) * 3.5);
        vec2 pushDir = normalize(fwd * 0.35 + right * latSign * (0.65 + 0.5 * bowW));
        float pushAmp = boatSpeed * hullBand * uWakeCoupling * 2.2;
        u += pushDir.x * pushAmp * uDt;
        v += pushDir.y * pushAmp * uDt;
      }

      vec2 fwd = vec2(cos(uBoatYaw), sin(uBoatYaw));
      vec2 right = vec2(-fwd.y, fwd.x);
      vec2 rel = worldXZ - uBoatPos;
      float lx = dot(rel, fwd);
      float lz = dot(rel, right);
      float propDist = (-uBoatHalfLenBeam.x * 0.92) - lx;
      if (propDist > -0.2 && propDist < 3.4 && abs(lz) < 1.3) {
        float jetMask = smoothstep(-0.2, 0.35, propDist) * exp(-propDist * 0.85) * exp(-lz * lz * 2.8);
        float jetForce = (1.5 + boatSpeed * 0.85) * uPropWash * jetMask;
        u += (-fwd.x * jetForce + right.x * sin(propDist * 5.0 + lz * 3.0) * jetForce * 0.3) * uDt;
        v += (-fwd.y * jetForce + right.y * sin(propDist * 5.0 + lz * 3.0) * jetForce * 0.3) * uDt;
      }
    }

    if (uBrushActive > 0.5) {
      float d = length(worldXZ - uBrushWorldXZ);
      if (d < uBrushRadius) {
        float w = exp(-(d * d) / max(0.05, uBrushRadius * uBrushRadius * 0.35));
        vec2 radial = normalize(worldXZ - uBrushWorldXZ + vec2(1e-4));
        u += (uBrushVel.x * 0.55 + radial.x * uBrushStrength * 2.2) * w * uDt;
        v += (uBrushVel.y * 0.55 + radial.y * uBrushStrength * 2.2) * w * uDt;
      }
    }

    // Bottom bed friction damps velocity rapidly in shallow beach swash & dry sand
    float bedFriction = mix(5.5, 0.0, wetMask);
    float damp = exp(-(uDamping + bedFriction) * uDt);
    u *= damp;
    v *= damp;

    if (uBoundaryMode == 1) {
      if (vUv.x < stepUv.x * 1.5 || vUv.x > 1.0 - stepUv.x * 1.5) u = 0.0;
      if (vUv.y < stepUv.y * 1.5 || vUv.y > 1.0 - stepUv.y * 1.5) v = 0.0;
    } else {
      float edgeX = min(vUv.x, 1.0 - vUv.x) / 0.08;
      float edgeZ = min(vUv.y, 1.0 - vUv.y) / 0.08;
      float sponge = clamp(min(edgeX, edgeZ), 0.0, 1.0);
      u *= mix(0.84, 1.0, sponge);
      v *= mix(0.84, 1.0, sponge);
    }

    u = clamp(u, -13.0, 13.0);
    v = clamp(v, -13.0, 13.0);
    fragColor = vec4(h, u, v, prevHullImp);
  } else {
    float uR = texture(uWaterTex, clamp(vUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).g;
    float uL = texture(uWaterTex, clamp(vUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).g;
    float vT = texture(uWaterTex, clamp(vUv + vec2(0.0, stepUv.y), 0.0, 1.0)).b;
    float vB = texture(uWaterTex, clamp(vUv - vec2(0.0, stepUv.y), 0.0, 1.0)).b;

    float div = (uR - uL) * inv2dx.x + (vT - vB) * inv2dx.y;
    float effDepth = max(0.35, localDepth);
    h -= effDepth * div * uDt * mix(0.35, 1.0, wetMask);

    float nextHullImp = 0.0;
    if (uBoatVisible > 0.5) {
      vec4 sdfData = boatHullSDF(worldXZ, uBoatPos, uBoatYaw, uBoatHalfLenBeam);
      if (sdfData.x < 0.25) {
        float insideMask = smoothstep(0.25, -0.35, sdfData.x);
        float depthWeight = clamp(uBoatDraft - uBoatY * 0.55, 0.05, 1.8);
        nextHullImp = insideMask * depthWeight * uWakeCoupling;
      }
      h += (nextHullImp - prevHullImp) * 0.85;
    }

    if (uBrushActive > 0.5) {
      float d = length(worldXZ - uBrushWorldXZ);
      if (d < uBrushRadius) {
        float w = exp(-(d * d) / max(0.05, uBrushRadius * uBrushRadius * 0.3));
        h -= uBrushStrength * 0.55 * w * uDt * 8.0;
      }
    }

    // Gentle sponge at outer boundaries (skip shore edge +X when shore is enabled so surf runs up freely)
    if (uBoundaryMode == 0) {
      float minX = uShoreEnabled > 0.5 ? vUv.x : min(vUv.x, 1.0 - vUv.x);
      float edgeX = minX / 0.075;
      float edgeZ = min(vUv.y, 1.0 - vUv.y) / 0.075;
      float sponge = clamp(min(edgeX, edgeZ), 0.0, 1.0);
      h *= mix(0.91, 1.0, sponge);
    }

    // Damp swash excess cleanly on dry beach
    if (bedY > 0.0) {
      h *= exp(-1.8 * uDt * smoothstep(0.0, 0.8, bedY));
    }

    h = clamp(h, -2.5, 2.5);
    fragColor = vec4(h, u, v, nextHullImp);
  }
}`;

// Pass 3: STRICTLY MASS-CONSERVING & BOUNDED Continuum Foam Step
// Fixes exponential runaway: zero amplification (>1.0) transfers, strict budget cap, and crisp rupture!
export const FOAM_STEP_FRAG = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uFoamTex;
uniform sampler2D uWaterTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
uniform float uDt;
uniform float uTime;

// Swell + Wind
uniform float uSwellAmp;
uniform float uSwellFreq;
uniform float uCrossChop;
uniform vec2 uWindVec;
uniform float uFoamAdvectSlip;

// Shore bathymetry & surf zone
uniform float uWaterDepth;
uniform float uShoreEnabled;
uniform float uShoreWidth;
uniform float uShoreSlope;
uniform float uShoreCurve;
uniform float uSurfBreakStrength;

// Foam continuum physics (bounded!)
uniform float uBreakingThreshold;
uniform float uBreakingRate;
uniform float uConvergenceRate;
uniform float uHullFoamChurn;
uniform float uThickDrainageRate;
uniform float uLaceRuptureRate;
uniform float uSubsurfaceDecay;
uniform float uMaxFoamBudget;
uniform int uBoundaryMode;

// Boat coupling
uniform float uBoatVisible;
uniform vec2 uBoatPos;
uniform vec2 uBoatVel;
uniform float uBoatYaw;
uniform float uBoatVY;
uniform vec2 uBoatHalfLenBeam;
uniform float uPropWash;

// Pointer brush
uniform float uBrushActive;
uniform vec2 uBrushWorldXZ;
uniform vec2 uBrushVel;
uniform float uBrushRadius;
uniform float uBrushStrength;

in vec2 vUv;
out vec4 fragColor;

float totalSurfaceH(vec2 uv, vec2 worldXZ, vec2 windDir) {
  float dynH = sampleBilinear(uWaterTex, uv, uSimRes).r;
  float swH = gerstnerSwell(worldXZ, uTime, uSwellAmp, uSwellFreq, uCrossChop, windDir);
  return dynH + swH;
}

void main() {
  vec2 stepUv = 1.0 / uSimRes;
  vec2 dx = uBoundsXZ / uSimRes;
  vec2 inv2dx = 0.5 / dx;
  vec2 worldXZ = (vUv - 0.5) * uBoundsXZ;
  float windSpd = length(uWindVec);
  vec2 windDir = windSpd > 0.01 ? uWindVec / windSpd : vec2(0.85, 0.52);

  vec4 wC = texture(uWaterTex, vUv);
  vec2 vel = wC.gb * uFoamAdvectSlip + uWindVec * 0.04;

  // Semi-Lagrangian / MacCormack advection with tight local min-max limiter
  vec2 backUv = vUv - vel * uDt / uBoundsXZ;
  vec4 phiHat = sampleBilinear(uFoamTex, backUv, uSimRes);
  vec4 backVelState = sampleBilinear(uWaterTex, backUv, uSimRes);
  vec2 backVel = backVelState.gb * uFoamAdvectSlip + uWindVec * 0.04;
  vec2 fwdUv = backUv + backVel * uDt / uBoundsXZ;
  vec4 phiCheck = sampleBilinear(uFoamTex, fwdUv, uSimRes);
  vec4 foamAdv = phiHat + 0.45 * (texture(uFoamTex, vUv) - phiCheck);

  vec2 clampedBack = clamp(backUv, stepUv, 1.0 - stepUv);
  vec4 n0 = texture(uFoamTex, clampedBack + vec2(stepUv.x, 0.0));
  vec4 n1 = texture(uFoamTex, clampedBack - vec2(stepUv.x, 0.0));
  vec4 n2 = texture(uFoamTex, clampedBack + vec2(0.0, stepUv.y));
  vec4 n3 = texture(uFoamTex, clampedBack - vec2(0.0, stepUv.y));
  vec4 nMin = min(min(n0, n1), min(n2, n3));
  vec4 nMax = max(max(n0, n1), max(n2, n3));
  foamAdv = clamp(foamAdv, min(phiHat, nMin), max(phiHat, nMax));

  float thick = foamAdv.r;
  float lace  = foamAdv.g;
  float sub   = foamAdv.b;
  float turb  = foamAdv.a;

  // Water height & shore bathymetry
  float hC = totalSurfaceH(vUv, worldXZ, windDir);
  float bedY = shoreBedY(worldXZ, uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve);
  float localDepth = hC - bedY;

  // Cleanly clear foam once water leaves dry upper beach
  if (localDepth < -0.04) {
    float dryFade = exp(-5.5 * uDt);
    fragColor = vec4(thick * dryFade, lace * dryFade, sub * dryFade, 0.0);
    return;
  }

  float hR = totalSurfaceH(vUv + vec2(stepUv.x, 0.0), worldXZ + vec2(dx.x, 0.0), windDir);
  float hL = totalSurfaceH(vUv - vec2(stepUv.x, 0.0), worldXZ - vec2(dx.x, 0.0), windDir);
  float hT = totalSurfaceH(vUv + vec2(0.0, stepUv.y), worldXZ + vec2(0.0, dx.y), windDir);
  float hB = totalSurfaceH(vUv - vec2(0.0, stepUv.y), worldXZ - vec2(0.0, dx.y), windDir);

  vec2 gradH = vec2((hR - hL) * inv2dx.x, (hT - hB) * inv2dx.y);
  float slope = length(gradH);
  float crestCurv = -(hR + hL - 2.0 * hC) / (dx.x * dx.x) - (hT + hB - 2.0 * hC) / (dx.y * dx.y);

  float uR = texture(uWaterTex, clamp(vUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).g;
  float uL = texture(uWaterTex, clamp(vUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).g;
  float vT = texture(uWaterTex, clamp(vUv + vec2(0.0, stepUv.y), 0.0, 1.0)).b;
  float vB = texture(uWaterTex, clamp(vUv - vec2(0.0, stepUv.y), 0.0, 1.0)).b;
  float div = (uR - uL) * inv2dx.x + (vT - vB) * inv2dx.y;

  // Self-limiting headroom so local foam cannot multiply out of control!
  float headroom = max(0.0, uMaxFoamBudget - (thick + lace * 0.45));

  // 1) Breaking Wave Whitecaps (only truly steep crests exceed uBreakingThreshold!)
  float crestFactor = smoothstep(0.08, 0.42, crestCurv);
  float steepExcess = max(0.0, slope - uBreakingThreshold);
  float breakingGen = steepExcess * crestFactor * uBreakingRate * 1.1 * headroom;
  thick += breakingGen * uDt;
  sub   += breakingGen * 0.6 * uDt;

  // 2) Coastal Shore Surf-Zone Wave Breaking (shallow water 0.02..0.85m when crest surges shoreward)
  if (uShoreEnabled > 0.5 && localDepth > 0.01 && localDepth < 0.92) {
    float surfBand = smoothstep(0.01, 0.14, localDepth) * smoothstep(0.92, 0.22, localDepth);
    float shoreRunup = max(0.0, wC.g) * 0.38 + max(0.0, hC) * 1.45 + max(0.0, slope - 0.14) * 1.6;
    float surfGen = surfBand * shoreRunup * uSurfBreakStrength * headroom;
    thick += surfGen * 0.85 * uDt;
    lace  += surfGen * 0.35 * uDt;
    sub   += surfGen * 0.75 * uDt;
  }

  // 3) MASS-CONSERVING Convergence: compresses EXISTING lace into thick froth (NEVER multiplies new mass!)
  float convRate = max(0.0, -div - 0.28) * uConvergenceRate;
  float transferToThick = min(lace, lace * convRate * uDt);
  lace  -= transferToThick;
  thick += transferToThick * 0.78;

  // 4) Boat Hull Bow Wave, Chine Spray & Propeller Slipstream
  if (uBoatVisible > 0.5) {
    vec4 sdfData = boatHullSDF(worldXZ, uBoatPos, uBoatYaw, uBoatHalfLenBeam);
    float sdf = sdfData.x;
    float bowW = sdfData.w;
    float boatSpd = length(uBoatVel);

    float hullRim = exp(-abs(sdf - 0.16) * abs(sdf - 0.16) * 5.8);
    float bowPlunge = (0.28 + 1.25 * bowW) * (boatSpd * 0.22 + abs(uBoatVY) * 0.55);
    float hullChurn = hullRim * bowPlunge * uHullFoamChurn * headroom;

    thick += hullChurn * 1.15 * uDt;
    sub   += hullChurn * 0.95 * uDt;
    turb  += hullChurn * 1.3 * uDt;

    vec2 fwd = vec2(cos(uBoatYaw), sin(uBoatYaw));
    vec2 right = vec2(-fwd.y, fwd.x);
    vec2 rel = worldXZ - uBoatPos;
    float lx = dot(rel, fwd);
    float lz = dot(rel, right);
    float propDist = (-uBoatHalfLenBeam.x * 0.92) - lx;
    if (propDist > -0.15 && propDist < 3.0 && abs(lz) < 1.1) {
      float washMask = smoothstep(-0.15, 0.32, propDist) * exp(-propDist * 0.88) * exp(-lz * lz * 3.4);
      float washEnergy = washMask * (0.25 + boatSpd * 0.2) * uPropWash * uHullFoamChurn * headroom;
      thick += washEnergy * 0.75 * uDt;
      sub   += washEnergy * 1.2 * uDt;
      turb  += washEnergy * 1.1 * uDt;
    }
  }

  // 5) Interactive Pointer Brush Churn
  if (uBrushActive > 0.5) {
    float d = length(worldXZ - uBrushWorldXZ);
    if (d < uBrushRadius) {
      float w = exp(-(d * d) / max(0.05, uBrushRadius * uBrushRadius * 0.35));
      float churn = (0.65 + length(uBrushVel) * 0.28) * uBrushStrength * w * headroom;
      thick += churn * 1.1 * uDt;
      sub   += churn * 0.9 * uDt;
      turb  += churn * 1.2 * uDt;
    }
  }

  // --- STRICT SUB-UNITY DRAINAGE & FAST OPEN-WATER RUPTURE ---
  // Thick drains -> 60% becomes lacy surface film, 40% pops/dissipates immediately!
  float drained = thick * (1.0 - exp(-uThickDrainageRate * uDt));
  thick -= drained;
  lace  += drained * 0.60;

  // Lace stretches and ruptures cleanly back to clear water
  float stretchTearing = 1.0 + max(0.0, div) * 2.0;
  lace *= exp(-uLaceRuptureRate * stretchTearing * uDt);

  // Subsurface bubbles rise & dissolve cleanly without inflating lace
  sub *= exp(-uSubsurfaceDecay * uDt);
  turb *= exp(-1.8 * uDt);

  if (uBoundaryMode == 0) {
    float minX = uShoreEnabled > 0.5 ? vUv.x : min(vUv.x, 1.0 - vUv.x);
    float edgeX = minX / 0.06;
    float edgeZ = min(vUv.y, 1.0 - vUv.y) / 0.06;
    float sponge = clamp(min(edgeX, edgeZ), 0.0, 1.0);
    thick *= sponge;
    lace  *= mix(0.75, 1.0, sponge);
    sub   *= sponge;
  }

  float cap = max(0.4, uMaxFoamBudget);
  fragColor = vec4(
    clamp(thick, 0.0, cap),
    clamp(lace, 0.0, cap),
    clamp(sub, 0.0, cap),
    clamp(turb, 0.0, 1.5)
  );
}`;

// Pass 4: Dual-Phase Flow Coordinate Advection
export const FLOW_ADVECTION_FRAG = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uFlowTex;
uniform sampler2D uWaterTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
uniform float uDt;
uniform vec2 uWindVec;
uniform float uFoamAdvectSlip;
uniform float uResetA;
uniform float uResetB;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 worldXZ = (vUv - 0.5) * uBoundsXZ;
  vec2 vel = texture(uWaterTex, vUv).gb * uFoamAdvectSlip + uWindVec * 0.04;
  vec2 backUv = vUv - vel * uDt / uBoundsXZ;
  vec4 advFlow = sampleBilinear(uFlowTex, backUv, uSimRes);

  vec2 coordA = uResetA > 0.5 ? worldXZ : advFlow.xy;
  vec2 coordB = uResetB > 0.5 ? worldXZ : advFlow.zw;

  fragColor = vec4(coordA, coordB);
}`;

// Pass 5: Procedural Sky Dome
export const SKY_VERT = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform mat4 uInvViewProj;
out vec3 vRayDir;
void main() {
  vec4 p = vec4(POS[gl_VertexID], 0.9999, 1.0);
  vec4 w = uInvViewProj * p;
  vRayDir = w.xyz / w.w;
  gl_Position = vec4(POS[gl_VertexID], 0.9999, 1.0);
}`;

export const SKY_FRAG = `#version 300 es
precision highp float;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uHazeDensity;
uniform float uSkyBrightness;
uniform float uShowAtmosphere;
in vec3 vRayDir;
out vec4 fragColor;

void main() {
  vec3 dir = normalize(vRayDir - uCameraPos);
  if (uShowAtmosphere < 0.5) {
    float g = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(mix(vec3(0.035, 0.038, 0.045), vec3(0.08, 0.09, 0.11), g), 1.0);
    return;
  }
  float up = clamp(dir.y, 0.0, 1.0);
  float horizonBand = pow(1.0 - up, mix(4.5, 1.8, uHazeDensity));
  vec3 sky = mix(uZenithColor, uHorizonColor, horizonBand) * uSkyBrightness;
  if (dir.y < 0.0) {
    sky = mix(uHorizonColor * 0.72, vec3(0.025, 0.035, 0.048), smoothstep(0.0, -0.35, dir.y));
  }

  float sunCos = max(dot(dir, normalize(uSunDir)), 0.0);
  float mieGlow = pow(sunCos, 10.0) * (0.28 + 0.35 * uHazeDensity);
  float sunDisc = smoothstep(0.99935, 0.99985, sunCos) * 14.0;
  sky += uSunColor * (mieGlow + sunDisc);

  fragColor = vec4(sky, 1.0);
}`;

// Pass 6: Displaced 3D Water Surface + Coastal Shore Clipping + Analytical Plateau-Border Foam
export const WATER_SURFACE_VERT = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uWaterTex;
uniform sampler2D uFoamTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
uniform float uTime;
uniform float uSwellAmp;
uniform float uSwellFreq;
uniform float uCrossChop;
uniform vec2 uWindVec;
uniform float uWaterDepth;
uniform float uShoreEnabled;
uniform float uShoreWidth;
uniform float uShoreSlope;
uniform float uShoreCurve;
uniform mat4 uViewProj;

in vec2 aGridUv;
out vec2 vUv;
out vec3 vWorldPos;
out float vBedY;

void main() {
  vUv = aGridUv;
  vec2 worldXZ = (aGridUv - 0.5) * uBoundsXZ;
  float windSpd = length(uWindVec);
  vec2 windDir = windSpd > 0.01 ? uWindVec / windSpd : vec2(0.85, 0.52);

  float bedY = shoreBedY(worldXZ, uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve);
  vBedY = bedY;

  float dynH = sampleBilinear(uWaterTex, aGridUv, uSimRes).r;
  float swH = gerstnerSwell(worldXZ, uTime, uSwellAmp, uSwellFreq, uCrossChop, windDir);
  float foamThick = sampleBilinear(uFoamTex, aGridUv, uSimRes).r;

  // Damp swell height gently over ultra-shallow beach slope so waves run smoothly onto shore
  float shallowAtten = smoothstep(-0.35, 1.4, -bedY);
  float h = dynH + swH * mix(0.32, 1.0, shallowAtten) + foamThick * 0.022;
  vec3 worldPos = vec3(worldXZ.x, h, worldXZ.y);
  vWorldPos = worldPos;
  gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

export const WATER_SURFACE_FRAG = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uWaterTex;
uniform sampler2D uFoamTex;
uniform sampler2D uFlowTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
uniform float uTime;

// Swell + Wind
uniform float uSwellAmp;
uniform float uSwellFreq;
uniform float uCrossChop;
uniform vec2 uWindVec;
uniform float uCapillaryChop;

// Shore bathymetry
uniform float uWaterDepth;
uniform float uShoreEnabled;
uniform float uShoreWidth;
uniform float uShoreSlope;
uniform float uShoreCurve;
uniform vec3 uBeachColor;

// Analytical Cellular Foam Parameters (Zero Textures / Zero Fake Particles!)
uniform float uCellScale;
uniform float uFilamentStretch;
uniform float uLaceCrispness;
uniform float uFoamRelief;
uniform float uSubsurfaceTintStrength;
uniform float uFlowPhaseA;
uniform float uFlowPhaseB;

// Water Optics
uniform float uAbsorptionDepth;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uSandColor;
uniform float uCausticIntensity;
uniform float uCausticScale;
uniform float uFresnelStrength;
uniform float uRoughnessBase;

// Lighting & Camera
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uGlintPower;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uHazeDensity;
uniform float uSkyBrightness;

// Boat Shadowing & Debug Mode
uniform float uBoatVisible;
uniform vec2 uBoatPos;
uniform float uBoatYaw;
uniform vec2 uBoatHalfLenBeam;
uniform int uDebugView;

in vec2 vUv;
in vec3 vWorldPos;
in float vBedY;
out vec4 fragColor;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

vec3 voronoiPlateau(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);

  float d1 = 8.0;
  float d2 = 8.0;
  vec2 bestCell = vec2(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + (0.14 + 0.72 * o) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        bestCell = n + g;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float f1 = sqrt(d1);
  float f2 = sqrt(d2);
  return vec3(f1, f2 - f1, fract(sin(dot(bestCell, vec2(41.1, 289.7))) * 43758.545));
}

// Crisp localized cellular foam evaluator: keeps clear dark water windows everywhere except active wake/surf/crests!
vec4 evalPhysicalCellularFoam(vec2 flowPos, vec2 vel, float thick, float lace) {
  float activity = thick + lace;
  if (activity < 0.04) return vec4(0.0);

  float speed = length(vel);
  vec2 dir = speed > 0.05 ? vel / speed : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float stretch = 1.0 + min(2.0, speed * 0.2 * uFilamentStretch);
  vec2 alignedPos = vec2(dot(flowPos, dir) / stretch, dot(flowPos, perp) * mix(1.0, 1.32, min(1.0, speed * 0.14)));

  vec2 warp = vec2(
    sin(alignedPos.y * 2.1 + alignedPos.x * 0.7) * 0.16,
    cos(alignedPos.x * 2.3 - alignedPos.y * 0.9) * 0.16
  );

  vec3 v1 = voronoiPlateau(alignedPos * uCellScale + warp);
  vec3 v2 = voronoiPlateau(alignedPos * (uCellScale * 2.35) - warp * 0.8 + vec2(7.3, 19.1));
  vec3 v3 = voronoiPlateau(flowPos * (uCellScale * 5.6) + vec2(31.7, 11.4));

  float edgeThick = mix(0.045, 0.2, clamp(lace * 0.7 + thick * 0.5, 0.0, 1.0));
  float wall1 = 1.0 - smoothstep(0.0, edgeThick, v1.y);
  float wall2 = 1.0 - smoothstep(0.0, edgeThick * 1.1, v2.y);

  float cellAlive1 = smoothstep(0.18, 0.8, lace * 1.15 + v1.z * 0.36 - 0.26);
  float cellAlive2 = smoothstep(0.24, 0.88, lace * 1.2 + v2.z * 0.32 - 0.3);
  float web = max(wall1 * cellAlive1, wall2 * cellAlive2 * 0.78);

  float microSpheres = 1.0 - smoothstep(0.15, 0.82, v3.x);
  float fineCushion = mix(0.68, 1.0, microSpheres) * (0.86 + 0.14 * (1.0 - v2.y));

  // Strict thresholds prevent trace foam from fogging clear ocean blue!
  float laceGate = smoothstep(0.09, 0.34, lace);
  float laceThreshold = mix(0.65, 0.28, clamp(uLaceCrispness, 0.0, 1.0));
  float laceMask = laceGate * smoothstep(laceThreshold * 0.6, laceThreshold * 0.6 + 0.2, lace * (0.35 + 1.25 * web));

  float thickFill = smoothstep(0.22, 0.68, thick) * mix(0.88, 1.0, microSpheres);

  float combinedMask = clamp(max(laceMask * 0.9, thickFill), 0.0, 1.0);
  float moundHeight = thickFill * (0.65 + 0.35 * microSpheres) + laceMask * web * 0.22;

  return vec4(combinedMask, web, moundHeight, fineCushion);
}

float evalCaustics(vec2 worldXZ, float t, float scale) {
  vec2 p = worldXZ * 0.65 * scale;
  vec3 c1 = voronoiPlateau(p + vec2(t * 0.38, -t * 0.24));
  vec3 c2 = voronoiPlateau(p * 1.37 - vec2(t * 0.29, t * 0.35) + vec2(4.2, 9.8));
  float lines1 = pow(1.0 - smoothstep(0.0, 0.28, c1.y), 2.4);
  float lines2 = pow(1.0 - smoothstep(0.0, 0.28, c2.y), 2.4);
  return (lines1 + lines2) * 0.65;
}

vec3 sampleSky(vec3 dir) {
  float up = clamp(dir.y, 0.0, 1.0);
  float hb = pow(1.0 - up, mix(4.5, 1.8, uHazeDensity));
  vec3 sky = mix(uZenithColor, uHorizonColor, hb) * uSkyBrightness;
  if (dir.y < 0.0) sky = mix(uHorizonColor * 0.72, uDeepColor, clamp(-dir.y * 2.5, 0.0, 1.0));
  return sky;
}

float totalHAt(vec2 uv, vec2 worldXZ, vec2 windDir, float bedY) {
  float dynH = sampleBilinear(uWaterTex, uv, uSimRes).r;
  float swH = gerstnerSwell(worldXZ, uTime, uSwellAmp, uSwellFreq, uCrossChop, windDir);
  float shallowAtten = smoothstep(-0.35, 1.4, -bedY);
  return dynH + swH * mix(0.32, 1.0, shallowAtten);
}

void main() {
  float localDepth = vWorldPos.y - vBedY;
  // Clean dry-shoreline cutout so dry sand is never covered by phantom water
  if (localDepth < -0.012) discard;

  vec2 stepUv = 1.0 / uSimRes;
  vec2 dx = uBoundsXZ / uSimRes;
  float windSpd = length(uWindVec);
  vec2 windDir = windSpd > 0.01 ? uWindVec / windSpd : vec2(0.85, 0.52);

  vec4 waterC = sampleBilinear(uWaterTex, vUv, uSimRes);
  vec4 foamC  = sampleBilinear(uFoamTex, vUv, uSimRes);
  vec4 flowC  = sampleBilinear(uFlowTex, vUv, uSimRes);

  float thick = foamC.r;
  float lace  = foamC.g;
  float sub   = foamC.b;

  if (uDebugView == 1) {
    vec3 dbg = vec3(thick, lace, sub);
    fragColor = vec4(clamp(dbg, 0.0, 1.0), 1.0);
    return;
  }
  if (uDebugView == 2) {
    float wA = sin(3.14159265 * uFlowPhaseA); wA *= wA;
    float wB = 1.0 - wA;
    vec2 gridA = abs(fract(flowC.xy * 0.4) - 0.5);
    vec2 gridB = abs(fract(flowC.zw * 0.4) - 0.5);
    float linesA = 1.0 - smoothstep(0.02, 0.07, min(gridA.x, gridA.y));
    float linesB = 1.0 - smoothstep(0.02, 0.07, min(gridB.x, gridB.y));
    float grid = linesA * wA + linesB * wB;
    vec3 velVis = vec3(0.15 + waterC.g * 0.12, 0.25 + grid * 0.72, 0.42 + waterC.b * 0.12);
    fragColor = vec4(clamp(velVis, 0.0, 1.0), 1.0);
    return;
  }
  if (uDebugView == 3) {
    float uR = texture(uWaterTex, clamp(vUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).g;
    float uL = texture(uWaterTex, clamp(vUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).g;
    float vT = texture(uWaterTex, clamp(vUv + vec2(0.0, stepUv.y), 0.0, 1.0)).b;
    float vB = texture(uWaterTex, clamp(vUv - vec2(0.0, stepUv.y), 0.0, 1.0)).b;
    float conv = max(0.0, -((uR - uL) / (2.0 * dx.x) + (vT - vB) / (2.0 * dx.y)));
    vec3 hCol = mix(vec3(0.05, 0.16, 0.38), vec3(0.2, 0.85, 0.75), clamp(waterC.r * 1.4 + 0.5, 0.0, 1.0));
    hCol += vec3(1.0, 0.55, 0.15) * clamp(conv * 0.65, 0.0, 1.0);
    fragColor = vec4(hCol, 1.0);
    return;
  }

  float hL = totalHAt(vUv - vec2(stepUv.x, 0.0), vWorldPos.xz - vec2(dx.x, 0.0), windDir, vBedY);
  float hR = totalHAt(vUv + vec2(stepUv.x, 0.0), vWorldPos.xz + vec2(dx.x, 0.0), windDir, vBedY);
  float hB = totalHAt(vUv - vec2(0.0, stepUv.y), vWorldPos.xz - vec2(0.0, dx.y), windDir, vBedY);
  float hT = totalHAt(vUv + vec2(0.0, stepUv.y), vWorldPos.xz + vec2(0.0, dx.y), windDir, vBedY);

  vec3 N = normalize(vec3((hL - hR) / (2.0 * dx.x), 1.0, (hB - hT) / (2.0 * dx.y)));

  if (uCapillaryChop > 0.001) {
    vec2 rp = vWorldPos.xz * 2.8 - windDir * uTime * 1.65;
    float r1 = cos(rp.x * 1.7 + rp.y * 0.9 + sin(rp.y * 2.1));
    float r2 = sin(rp.y * 2.3 - rp.x * 1.1 + cos(rp.x * 1.8));
    N = normalize(N + vec3(r1, 0.0, r2) * (0.042 * uCapillaryChop));
  }

  // Dual-phase Lagrangian cellular foam evaluation
  float wA = sin(3.14159265 * uFlowPhaseA); wA *= wA;
  float wB = 1.0 - wA;
  vec4 cellA = evalPhysicalCellularFoam(flowC.xy, waterC.gb, thick, lace);
  vec4 cellB = evalPhysicalCellularFoam(flowC.zw, waterC.gb, thick, lace);
  vec4 foamCell = cellA * wA + cellB * wB;

  float foamMask = smoothstep(0.16, 0.72, foamCell.x + 0.1 * thick);
  float moundHeight = foamCell.z;
  float foamShade = foamCell.w;

  // Camera-invariant world-space Jacobian micro-normals for aerated foam mounds
  vec3 dPdx = dFdx(vWorldPos);
  vec3 dPdy = dFdy(vWorldPos);
  float dmDx = dFdx(moundHeight);
  float dmDy = dFdy(moundHeight);
  float det = dPdx.x * dPdy.z - dPdx.z * dPdy.x;
  vec2 foamSlope = abs(det) > 1e-6
    ? vec2(dmDx * dPdy.z - dmDy * dPdx.z, dPdx.x * dmDy - dPdy.x * dmDx) / det
    : vec2(0.0);
  foamSlope = clamp(foamSlope, vec2(-2.5), vec2(2.5));
  vec3 foamN = normalize(N + vec3(-foamSlope.x, 0.0, -foamSlope.y) * (0.32 * uFoamRelief));

  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  // Use true local bathymetry depth for Beer-Lambert shallow-to-deep color transition!
  vec3 refrDir = refract(-V, N, 1.0 / 1.333);
  float floorDist = max(0.02, localDepth / max(0.22, -refrDir.y));
  vec2 seabedHit = vWorldPos.xz + refrDir.xz * floorDist;

  float sandRipple = 0.92 + 0.08 * sin(seabedHit.x * 3.1 + sin(seabedHit.y * 1.4));
  float causticFocus = evalCaustics(seabedHit, uTime, uCausticScale) * uCausticIntensity;
  float sunNdotL = max(L.y, 0.05);
  vec3 bedAlbedo = mix(uBeachColor, uSandColor, smoothstep(-0.3, -1.8, vBedY));
  vec3 seabedColor = bedAlbedo * sandRipple * (0.35 + 0.85 * sunNdotL)
                   + uSunColor * causticFocus * 0.45 * sunNdotL;

  if (uBoatVisible > 0.5) {
    vec4 boatSdf = boatHullSDF(vWorldPos.xz, uBoatPos, uBoatYaw, uBoatHalfLenBeam);
    float hullShadow = smoothstep(-0.3, 1.1, boatSdf.x);
    seabedColor *= mix(0.28, 1.0, hullShadow);
  }

  float opticalDepth = floorDist / max(0.5, uAbsorptionDepth);
  vec3 absorbVec = exp(-opticalDepth * vec3(1.8, 0.5, 0.25));
  vec3 waterBodyCol = mix(uDeepColor, mix(uShallowColor, seabedColor, 0.72), absorbVec);

  // Subtle shoreline swash meniscus tint right where localDepth -> 0
  float shoreEdgeFade = smoothstep(0.0, 0.16, localDepth);
  waterBodyCol = mix(seabedColor * 0.88, waterBodyCol, shoreEdgeFade);

  // Subsurface entrained micro-bubble cloud (localized turquoise glow in boat wake & surf)
  vec3 subBubbleCol = mix(uShallowColor * 1.3, vec3(0.42, 0.85, 0.90), 0.5);
  waterBodyCol += subBubbleCol * (clamp(sub * 0.72, 0.0, 0.9) * uSubsurfaceTintStrength * (0.45 + 0.55 * sunNdotL));

  float NdotV = max(dot(N, V), 0.001);
  float fresnel = mix(0.02, 0.96, pow(1.0 - NdotV, 5.0)) * uFresnelStrength * mix(0.35, 1.0, shoreEdgeFade);
  vec3 R = reflect(-V, N);
  vec3 skyRefl = sampleSky(R);

  float NdotH = max(dot(N, H), 0.0);
  float specPower = mix(uGlintPower, 28.0, clamp(uRoughnessBase * 8.0 + foamMask * 0.85, 0.0, 1.0));
  float specNorm = (specPower + 8.0) / 25.1327;
  vec3 sunSpec = uSunColor * uSunIntensity * (pow(NdotH, specPower) * specNorm * 0.085);

  vec3 clearWater = mix(waterBodyCol, skyRefl, clamp(fresnel, 0.02, 0.94)) + sunSpec * (1.0 - foamMask * 0.82);

  // Crisp Physical Foam Shading
  float foamDiffuse = 0.35 + 0.72 * max(dot(foamN, L), 0.0);
  vec3 foamShadowTint = mix(vec3(0.18, 0.38, 0.48), uHorizonColor * 0.58, 0.38);
  vec3 foamTopAlbedo = vec3(1.04, 1.06, 1.08) * (0.48 + 0.52 * foamDiffuse * uSunIntensity * 0.36);
  vec3 foamLit = mix(foamShadowTint, foamTopAlbedo, foamShade);
  foamLit += uSunColor * pow(max(dot(foamN, H), 0.0), 36.0) * 0.15 * uSunIntensity;

  float edgeRimDarken = mix(0.92, 1.0, smoothstep(0.0, 0.35, foamMask));
  vec3 finalCol = mix(clearWater * edgeRimDarken, foamLit, foamMask);

  float dist = length(uCameraPos - vWorldPos);
  float fogAmt = 1.0 - exp(-dist * 0.0016 * (0.4 + uHazeDensity * 2.0));
  finalCol = mix(finalCol, uHorizonColor * uSkyBrightness * 0.75, clamp(fogAmt, 0.0, 0.42));

  fragColor = vec4(finalCol, 1.0);
}`;

// Pass 7: Cutaway Water Tank Sides (clamped cleanly against sloping Shore bathymetry!)
export const WATER_SKIRT_VERT = `#version 300 es
${COMMON_GLSL}
uniform sampler2D uWaterTex;
uniform sampler2D uFoamTex;
uniform vec2 uSimRes;
uniform vec2 uBoundsXZ;
uniform float uTime;
uniform float uSwellAmp;
uniform float uSwellFreq;
uniform float uCrossChop;
uniform vec2 uWindVec;
uniform float uWaterDepth;
uniform float uShoreEnabled;
uniform float uShoreWidth;
uniform float uShoreSlope;
uniform float uShoreCurve;
uniform mat4 uViewProj;

in vec3 aEdgeParam;
in vec3 aNormal;
out vec3 vWorldPos;
out vec3 vNormal;
out float vDepthFrac;
out float vColumnThickness;

void main() {
  vec2 uv = aEdgeParam.xy;
  vec2 worldXZ = (uv - 0.5) * uBoundsXZ;
  float bedY = shoreBedY(worldXZ, uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve);

  float windSpd = length(uWindVec);
  vec2 windDir = windSpd > 0.01 ? uWindVec / windSpd : vec2(0.85, 0.52);
  float dynH = sampleBilinear(uWaterTex, uv, uSimRes).r;
  float swH = gerstnerSwell(worldXZ, uTime, uSwellAmp, uSwellFreq, uCrossChop, windDir);
  float shallowAtten = smoothstep(-0.35, 1.4, -bedY);
  float foamThick = sampleBilinear(uFoamTex, uv, uSimRes).r;
  float waterTopY = dynH + swH * mix(0.32, 1.0, shallowAtten) + foamThick * 0.022;

  float clampedTop = max(bedY, waterTopY);
  float y = aEdgeParam.z > 0.5 ? clampedTop : bedY;
  vColumnThickness = max(0.0, clampedTop - bedY);
  vWorldPos = vec3(worldXZ.x, y, worldXZ.y);
  vNormal = aNormal;
  vDepthFrac = aEdgeParam.z;
  gl_Position = uViewProj * vec4(vWorldPos, 1.0);
}`;

export const WATER_SKIRT_FRAG = `#version 300 es
precision highp float;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uCameraPos;
uniform float uGlassOpacity;
in vec3 vWorldPos;
in vec3 vNormal;
in float vDepthFrac;
in float vColumnThickness;
out vec4 fragColor;

void main() {
  if (vColumnThickness < 0.015) discard;
  vec3 V = normalize(uCameraPos - vWorldPos);
  float rim = pow(1.0 - max(abs(dot(normalize(vNormal), V)), 0.0), 1.8);
  vec3 col = mix(uDeepColor * 0.85, uShallowColor * 1.25, clamp(vDepthFrac, 0.0, 1.0));
  float meniscus = smoothstep(0.95, 1.0, vDepthFrac);
  col += vec3(0.55, 0.88, 0.98) * (meniscus * 0.5 + rim * 0.25);
  float alpha = clamp(uGlassOpacity + rim * 0.28 + meniscus * 0.24, 0.08, 0.88);
  fragColor = vec4(col, alpha);
}`;

// Pass 8: Displaced 3D Seabed + Curved Sandy Beach Terrain + Wet Swash Sheen + Studio Grid
export const SEABED_VERT = `#version 300 es
${COMMON_GLSL}
uniform vec2 uBoundsXZ;
uniform float uWaterDepth;
uniform float uShoreEnabled;
uniform float uShoreWidth;
uniform float uShoreSlope;
uniform float uShoreCurve;
uniform mat4 uViewProj;

// aGridUv in [-2..+2] normalized domain (inside [0..1] = WaterBody terrain, outside = studio floor)
in vec2 aPosUv;
out vec3 vWorldPos;
out vec3 vNormal;
out float vInsideBounds;

void main() {
  vec2 worldXZ = (aPosUv - 0.5) * uBoundsXZ;
  vec2 halfB = uBoundsXZ * 0.5;
  bool inB = abs(worldXZ.x) <= halfB.x + 0.01 && abs(worldXZ.y) <= halfB.y + 0.01;
  vInsideBounds = inB ? 1.0 : 0.0;

  float y = inB
    ? shoreBedY(worldXZ, uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve)
    : -uWaterDepth;

  float eps = 0.25;
  float yR = inB ? shoreBedY(worldXZ + vec2(eps, 0.0), uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve) : -uWaterDepth;
  float yL = inB ? shoreBedY(worldXZ - vec2(eps, 0.0), uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve) : -uWaterDepth;
  float yT = inB ? shoreBedY(worldXZ + vec2(0.0, eps), uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve) : -uWaterDepth;
  float yB = inB ? shoreBedY(worldXZ - vec2(0.0, eps), uBoundsXZ, uWaterDepth, uShoreEnabled, uShoreWidth, uShoreSlope, uShoreCurve) : -uWaterDepth;

  vNormal = normalize(vec3(yL - yR, 2.0 * eps, yB - yT));
  vWorldPos = vec3(worldXZ.x, y, worldXZ.y);
  gl_Position = uViewProj * vec4(vWorldPos, 1.0);
}`;

export const SEABED_FRAG = `#version 300 es
precision highp float;
uniform vec2 uBoundsXZ;
uniform vec3 uSandColor;
uniform vec3 uBeachColor;
uniform float uSandWetness;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uCausticIntensity;
uniform float uCausticScale;
uniform float uTime;
uniform float uStudioGridOpacity;

in vec3 vWorldPos;
in vec3 vNormal;
in float vInsideBounds;
out vec4 fragColor;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

float voronoiEdge(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + (0.14 + 0.72 * hash22(n + g)) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

void main() {
  vec2 halfB = uBoundsXZ * 0.5;
  bool insideBounds = abs(vWorldPos.x) <= halfB.x + 0.01 && abs(vWorldPos.z) <= halfB.y + 0.01;
  if (insideBounds) {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    // Subtle organic beach sand grain + wind/wave sand ripples
    float grain = 0.94 + 0.06 * sin(vWorldPos.x * 9.5 + sin(vWorldPos.z * 7.2) * 2.0);
    float ripple = 0.92 + 0.08 * sin(vWorldPos.x * 3.1 + sin(vWorldPos.z * 1.4));
    vec3 baseSand = mix(uSandColor, uBeachColor, smoothstep(-1.4, 0.25, vWorldPos.y)) * grain * ripple;

    // Wet swash zone just above waterline (0.0 .. +0.45m) darkens & gets glossy sky reflection!
    float wetBand = (1.0 - smoothstep(0.02, 0.52, vWorldPos.y)) * uSandWetness;
    vec3 wetAlbedo = baseSand * mix(1.0, 0.46, wetBand);

    float NdotL = max(dot(N, L), 0.0);
    vec3 ambient = mix(uHorizonColor * 0.28, uZenithColor * 0.35, 0.5) * wetAlbedo;
    vec3 diffuse = wetAlbedo * NdotL * uSunColor * (uSunIntensity * 0.34);

    // Underwater caustics below water surface
    float underwaterMask = 1.0 - smoothstep(-0.08, 0.04, vWorldPos.y);
    vec2 cp = vWorldPos.xz * 0.65 * uCausticScale;
    float c1 = pow(1.0 - smoothstep(0.0, 0.28, voronoiEdge(cp + vec2(uTime * 0.35, -uTime * 0.22))), 2.2);
    vec3 caustics = uSunColor * c1 * uCausticIntensity * 0.36 * max(L.y, 0.08) * underwaterMask;

    // Wet sand specular sheen
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.55 * wetBand;
    vec3 skyRefl = mix(uHorizonColor, uZenithColor, 0.4) * fres;
    float spec = pow(max(dot(N, H), 0.0), 96.0) * 0.35 * wetBand * uSunIntensity;

    fragColor = vec4(ambient + diffuse + caustics + skyRefl + uSunColor * spec, 1.0);
  } else {
    vec2 fw = max(fwidth(vWorldPos.xz * 0.25), vec2(1e-4));
    vec2 g1 = abs(fract(vWorldPos.xz * 0.25 - 0.5) - 0.5) / fw;
    float line1 = 1.0 - min(min(g1.x, g1.y), 1.0);
    float distFade = exp(-length(vWorldPos.xz) * 0.014);
    vec3 bg = vec3(0.032, 0.034, 0.04);
    vec3 gridCol = mix(bg, vec3(0.18, 0.22, 0.26), line1 * uStudioGridOpacity * distFade);
    fragColor = vec4(gridCol, 1.0);
  }
}`;

// Pass 9: Lit 3D Boat Vessel Mesh
export const BOAT_VERT = `#version 300 es
precision highp float;
uniform mat4 uViewProj;
uniform mat4 uModel;
in vec3 aPos;
in vec3 aNormal;
in float aMatId;
out vec3 vWorldPos;
out vec3 vNormal;
out float vMatId;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vMatId = aMatId;
  gl_Position = uViewProj * wp;
}`;

export const BOAT_FRAG = `#version 300 es
precision highp float;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uSkyBrightness;

in vec3 vWorldPos;
in vec3 vNormal;
in float vMatId;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  vec3 albedo = vec3(0.12, 0.19, 0.28);
  float roughness = 0.26;
  float metallic = 0.05;

  if (vMatId > 0.5 && vMatId < 1.5) {
    albedo = vec3(0.55, 0.14, 0.13);
    roughness = 0.34;
  } else if (vMatId >= 1.5 && vMatId < 2.5) {
    float plank = 0.88 + 0.12 * sin(vWorldPos.z * 28.0);
    albedo = vec3(0.52, 0.34, 0.18) * plank;
    roughness = 0.58;
  } else if (vMatId >= 2.5 && vMatId < 3.5) {
    albedo = vec3(0.90, 0.91, 0.92);
    roughness = 0.22;
  } else if (vMatId >= 3.5 && vMatId < 4.5) {
    albedo = vec3(0.05, 0.09, 0.13);
    roughness = 0.05;
    metallic = 0.15;
  } else if (vMatId >= 4.5) {
    albedo = vec3(0.75, 0.78, 0.82);
    roughness = 0.18;
    metallic = 0.85;
  }

  float wetMask = smoothstep(0.28, -0.05, vWorldPos.y);
  roughness = mix(roughness, 0.08, wetMask * 0.75);
  albedo *= mix(1.0, 0.78, wetMask);

  float NdotL = max(dot(N, L), 0.0);
  float skyFill = 0.45 + 0.55 * N.y;
  vec3 ambient = mix(uHorizonColor * 0.32, uZenithColor * 0.48, skyFill) * uSkyBrightness * albedo;

  float specPow = mix(220.0, 12.0, roughness * roughness);
  float fres = mix(0.04, 0.9, pow(1.0 - max(dot(N, V), 0.0), 5.0));
  vec3 skyRefl = mix(uHorizonColor, uZenithColor, clamp(reflect(-V, N).y * 0.5 + 0.5, 0.0, 1.0)) * uSkyBrightness;

  vec3 diffuse = albedo * (1.0 - metallic * 0.75) * NdotL * uSunColor * (uSunIntensity * 0.38);
  vec3 spec = mix(uSunColor, albedo, metallic) * pow(max(dot(N, H), 0.0), specPow) * uSunIntensity * 0.35;
  vec3 col = ambient + diffuse + spec + skyRefl * fres * mix(0.28, 0.85, 1.0 - roughness);

  fragColor = vec4(col, 1.0);
}`;

// Pass 10: Bounds Wireframe & Selection Rings
export const LINE_VERT = `#version 300 es
precision highp float;
uniform mat4 uViewProj;
in vec3 aPos;
in vec4 aColor;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

export const LINE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() {
  fragColor = vColor;
}`;

// Pass 11: ACES Film Tone Mapping + Glint Bloom + Contrast/Saturation/Vignette
export const POST_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSceneTex;
uniform vec2 uTexelSize;
uniform float uExposureEV;
uniform float uContrast;
uniform float uSaturation;
uniform float uBloom;
uniform float uVignette;
in vec2 vUv;
out vec4 fragColor;

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 col = texture(uSceneTex, vUv).rgb;

  if (uBloom > 0.001) {
    vec3 bloomSum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.785398;
      vec2 off = vec2(cos(ang), sin(ang)) * uTexelSize * 4.5;
      vec3 s = texture(uSceneTex, clamp(vUv + off, 0.001, 0.999)).rgb;
      float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
      bloomSum += max(s - vec3(0.92), vec3(0.0)) * smoothstep(0.88, 1.5, lum);
    }
    col += (bloomSum * 0.125) * uBloom * 0.7;
  }

  col *= exp2(uExposureEV);
  col = acesFilm(col);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;

  vec2 d = vUv - 0.5;
  float vig = 1.0 - dot(d, d) * (uVignette * 0.85);
  col *= clamp(vig, 0.35, 1.0);

  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}`;
