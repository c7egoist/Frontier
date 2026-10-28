/**
 * Wind vertex animation.
 *
 * Standard three-tier vegetation wind (the approach used by SpeedTree-style
 * runtimes and described in GPU Gems 3, ch. 16 "Vegetation Procedural
 * Animation and Shading in Crysis"):
 *
 *   1. trunk sway   – whole tree bends with height^2 (cantilever profile);
 *   2. limb bending – each limb rotates about its own pivot (the vertex carries
 *                     the pivot position + a per-limb phase), weight grows with
 *                     the distance along the limb;
 *   3. detail       – high-frequency flutter of twigs and leaves.
 *
 * Because the branch system is ONE welded mesh, the deformation is continuous
 * across junctions: a twig inherits the trunk sway and the limb bend of the
 * branch it grows from, plus its own flutter.
 */

import { FIELD_SAMPLE_GLSL, PUSH_GLSL } from './interaction';

export const WIND_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3  uWindDir;
uniform float uWindStrength;
uniform float uWindGust;
uniform float uTreeHeight;
uniform float uTrunkFlex;
uniform float uLimbFlex;
uniform float uDetailFlex;
uniform vec4  uPush;         // hand collider centre (xyz) and radius (w): sag reference, stateless fallback
uniform float uPushStrength; // 0 = off
uniform float uPushStiff;    // 0 soft foliage (yields locally) … 1 rigid (moves as whole limbs)
uniform float uFieldOn;      // 1 = sample the displacement field, 0 = stateless fallback
${FIELD_SAMPLE_GLSL}
${PUSH_GLSL}
`;

export const WIND_ATTRIBUTES = /* glsl */ `
attribute vec4 aWind;   // height, limb, phase, detail
attribute vec3 aPivot;
`;

export const WIND_FUNCTIONS = /* glsl */ `
vec3 rotateAroundAxis(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

// Smooth triangle-ish wave used to avoid the too-regular look of a pure sine.
float windWave(float t) {
  return sin(t) * 0.7 + sin(t * 2.31 + 1.3) * 0.2 + sin(t * 4.7 + 0.7) * 0.1;
}

// Displacement at a point: the GPU spring field (see interaction.ts) or, without float
// render targets, the instantaneous shell push of the hand collider.
vec3 pushDisp(vec3 q) {
  if (uFieldOn > 0.5) return fieldAt(q);
  return pushFromCapsule(q, uPush.xyz, uPush.xyz, uPush.w) * mix(1.1, 0.45, uPushStiff);
}

// Collision response on the GPU: the plant bends out of the way of the colliders.
// Two tiers like the wind, so that it stays hierarchical: the limb is moved as a
// whole by what its pivot feels (scaled by the distance along the limb), and
// every vertex additionally yields locally. Roots and the base stay anchored.
vec3 applyPush(vec3 p) {
  if (uPushStrength <= 0.0) return p;
  float anchor = smoothstep(0.0, 0.18, aWind.x);
  vec3 dp = vec3(0.0);
  if (aWind.y > 0.0) dp += pushDisp(aPivot) * (0.35 + 0.65 * aWind.y) * mix(0.8, 1.2, uPushStiff);
  dp += pushDisp(p) * mix(1.0, 0.45, uPushStiff);
  dp *= uPushStrength * anchor;
  // The bent part sags a little, as a pushed stem does, instead of stretching.
  float m = length(dp);
  dp.y -= 0.25 * m * m / max(uPush.w, 0.05);
  return p + dp;
}

vec3 applyWind(vec3 p) {
  vec3 dir = normalize(vec3(uWindDir.x, 0.0, uWindDir.z) + vec3(1e-4, 0.0, 0.0));
  vec3 side = cross(vec3(0.0, 1.0, 0.0), dir);

  // Gust envelope shared by the whole tree with a small phase lag by height.
  float gust = 0.5 + 0.5 * windWave(uTime * 0.6 - aWind.x * 0.8);
  gust = mix(0.6, 1.0, gust) * (1.0 + uWindGust * (0.5 + 0.5 * sin(uTime * 0.23)));
  float strength = uWindStrength * gust;

  // --- 2. limb bending: rotate around the limb pivot ---
  if (aWind.y > 0.0) {
    vec3 rel = p - aPivot;
    float ph = aWind.z * 6.2831;
    float w = aWind.y * aWind.y;
    float ang = uLimbFlex * strength * 0.12 * w * (windWave(uTime * 1.3 + ph) * 0.8 + 0.5);
    vec3 axis = normalize(side + 1e-4);
    // Bend mostly downwind, a little up/down.
    rel = rotateAroundAxis(rel, axis, ang);
    rel = rotateAroundAxis(rel, dir, ang * 0.35 * sin(uTime * 0.9 + ph * 1.7));
    p = aPivot + rel;
  }

  // --- 3. detail flutter ---
  if (aWind.w > 0.0) {
    float f = aWind.w * uDetailFlex * strength;
    float ph = aWind.z * 12.566 + p.x * 3.1 + p.z * 2.7;
    p += side * (sin(uTime * 7.3 + ph) * 0.02 * f);
    p.y += sin(uTime * 5.1 + ph * 1.3) * 0.015 * f;
    p += dir * (sin(uTime * 6.2 + ph * 0.7) * 0.02 * f);
  }

  // --- 1. trunk sway: cantilever profile ---
  float h = aWind.x;
  float sway = uTrunkFlex * strength * 0.035 * h * h * uTreeHeight;
  float t = windWave(uTime * 0.85) * 0.7 + 0.3;
  p += dir * (sway * t);
  p += side * (sway * 0.2 * windWave(uTime * 0.55 + 2.0));
  return applyPush(p);
}
`;
