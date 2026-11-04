/**
 * GPU programs for the planet-scale landscape viewport.
 *
 * Two materials:
 *   Terrain  — flat lithology shading (the Frontiers rule: no procedural colour
 *              noise standing in for rock) driven by elevation, slope and
 *              cavity, with aerial perspective so a 300 km horizon reads.
 *   Ocean    — summed Gerstner swell + wind chop, per-pixel normals, Fresnel
 *              sky reflection, sun specular, depth-graded absorption and
 *              scattering, and surf/foam driven by the CPU-computed bed depth,
 *              wave breaking criterion and shoreline distance field.
 *
 * Both read the same world-space conventions as src/core/landscape-field.js:
 *   x, z metres east/south, y metres elevation, sea level normally at 0.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Wave field shared by the water vertex and fragment stages. */
export const OCEAN_WAVE_GLSL = /* glsl */`
uniform float uTime;
uniform vec4 uSwell;      // dir.x, dir.z, amplitude m, wavelength m
uniform vec4 uChop;       // steepness 0..1, wind speed m/s, detail amp, sea level
uniform vec2 uOriginDrag; // shifts the wave phase with the camera so far water still moves

struct WaveSample {
  vec3 offset;   // xz displacement (choppy), y elevation
  vec3 normal;
  float crest;   // 0..1 normalised crest height, used for whitecaps
};

WaveSample sampleOcean(vec2 worldXZ, float shoal) {
  WaveSample result;
  result.offset = vec3(0.0);
  result.normal = vec3(0.0, 1.0, 0.0);
  result.crest = 0.0;

  vec2 p = worldXZ - uOriginDrag;
  float steep = uChop.x;
  float baseAmp = uSwell.z;
  float baseLen = max(6.0, uSwell.w);
  vec2 dir = normalize(uSwell.xy + vec2(1e-5));

  // Four octaves of swell: the dominant train plus three progressively
  // rotated and shorter trains. Shoaling shortens and steepens them as the
  // bed rises, which is what produces shore-facing surf rather than uniformly
  // rolling waves sliding under the beach.
  float amp = baseAmp * shoal;
  float len = baseLen * mix(1.0, 0.55, 1.0 - shoal);
  float rot = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float k = 6.2831853 / max(2.0, len);
    float omega = sqrt(9.81 * k) * (0.85 + 0.3 * shoal);
    vec2 d = vec2(dir.x * cos(rot) - dir.y * sin(rot), dir.x * sin(rot) + dir.y * cos(rot));
    float phase = dot(d, p) * k - uTime * omega * (1.0 + fi * 0.06);
    float a = amp / (1.0 + fi * 0.85);
    float s = sin(phase);
    float c = cos(phase);
    // Gerstner horizontal orbit gives sharp crests and flat troughs.
    result.offset.x += d.x * (c * a * steep * 0.5);
    result.offset.y += s * a;
    result.offset.z += d.y * (c * a * steep * 0.5);
    // Analytic derivative -> exact normal, no dFdx needed.
    float slope = c * a * k;
    result.normal.x -= d.x * slope;
    result.normal.z -= d.y * slope;
    result.crest += max(0.0, s) * (a / max(1e-4, baseAmp * shoal)) / (1.0 + fi);
    amp *= 0.52;
    len *= 0.47;
    rot += 0.72 + fi * 0.11;
  }

  // Wind chop: short, cross-directional noise waves. They do not displace
  // geometry much but they carry most of the visible glinting detail.
  float wind = uChop.y;
  float chopAmp = uChop.z * (0.35 + wind * 0.075) * shoal;
  vec2 wp = p * 0.9;
  for (int i = 0; i < 3; i++) {
    float fi = float(i) + 1.0;
    vec2 dirC = normalize(vec2(cos(fi * 2.1), sin(fi * 2.1)) + dir * 0.6);
    float kc = 6.2831853 / (6.0 + fi * 4.5);
    float phaseC = dot(dirC, wp) * kc + uTime * (1.1 + fi * 0.7);
    float ac = chopAmp / fi;
    result.normal.x -= dirC.x * cos(phaseC) * ac * kc;
    result.normal.z -= dirC.y * cos(phaseC) * ac * kc;
    result.offset.y += sin(phaseC) * ac * 0.35;
  }

  result.normal = normalize(result.normal);
  result.crest = clamp(result.crest, 0.0, 1.6);
  return result;
}
`;

/**
 * Small analytic sky, used for reflections and the horizon gradient.
 *
 * Self-contained on purpose: this block is included by the sky dome, the ocean
 * and the terrain, so it declares the uniforms it reads. Every stage that adds
 * its own extra uniforms must build them from SKY_UNIFORMS values — a duplicate
 * `uniform` declaration is a compile error, not a warning.
 */
export const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;

vec3 skyRadiance(vec3 dir) {
  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(uSkyHorizon, uSkyZenith, pow(up, 0.62));
  float sunAmt = pow(max(0.0, dot(normalize(dir), uSunDir)), 220.0);
  float halo = pow(max(0.0, dot(normalize(dir), uSunDir)), 6.0) * 0.22;
  return base + vec3(1.0, 0.92, 0.78) * (sunAmt * 6.0 + halo);
}
`;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export const TERRAIN_VERTEX = /* glsl */`
precision highp float;

attribute float aElevation;
attribute float aCurvature;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vElevation;
varying float vCurvature;
varying float vViewDistance;

void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorld = world;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vElevation = aElevation;
  vCurvature = aCurvature;
  vViewDistance = length(world - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */`
precision highp float;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vElevation;
varying float vCurvature;
varying float vViewDistance;

uniform float uSeaLevel;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform float uSnowLine;
uniform float uAmbient;

${SKY_GLSL}

// Flat lithology palette. Colours are deliberately untextured blends of real
// mineral families (as the Frontiers flat-colour pass requires); every band
// below is a geological boundary, not a stripe.
const vec3 C_DEEPSEABED = vec3(0.113, 0.129, 0.121);
const vec3 C_SEABED     = vec3(0.329, 0.325, 0.243);
const vec3 C_WET_SAND   = vec3(0.337, 0.286, 0.196);
const vec3 C_SAND       = vec3(0.717, 0.643, 0.443);
const vec3 C_SALT       = vec3(0.678, 0.663, 0.588);
const vec3 C_GRASS      = vec3(0.278, 0.337, 0.192);
const vec3 C_STEPPE     = vec3(0.415, 0.412, 0.243);
const vec3 C_ROCK       = vec3(0.352, 0.337, 0.305);
const vec3 C_CLIFF      = vec3(0.286, 0.270, 0.250);
const vec3 C_SCREE      = vec3(0.458, 0.427, 0.376);
const vec3 C_SNOW       = vec3(0.882, 0.905, 0.933);
const vec3 C_ICE        = vec3(0.717, 0.796, 0.847);

void main() {
  vec3 N = normalize(vNormalW);
  float elevation = vElevation;
  float aboveSea = elevation - uSeaLevel;

  float slope = 1.0 - clamp(N.y, 0.0, 1.0);
  float rockiness = smoothstep(0.30, 0.62, slope);

  // Cavity: negative in hollows (occluded), positive on ridges (exposed).
  float cavity = clamp(vCurvature * 0.6, -1.0, 1.0);
  float ao = mix(1.0, 0.62, clamp(-cavity, 0.0, 1.0));
  ao *= mix(0.72, 1.0, smoothstep(0.0, 0.55, 1.0 - slope));

  vec3 albedo;
  if (aboveSea < 0.0) {
    float depth = -aboveSea;
    albedo = mix(C_SEABED, C_DEEPSEABED, smoothstep(40.0, 900.0, depth));
    albedo = mix(C_SAND * 0.82, albedo, smoothstep(1.0, 26.0, depth));
  } else {
    // Beach, then lowland vegetation, then steppe, then bare rock, then snow.
    float beach = 1.0 - smoothstep(2.0, 12.0 + uSnowLine * 0.0, aboveSea);
    float lowland = smoothstep(4.0, 60.0, aboveSea);
    float upland = smoothstep(260.0, 900.0, aboveSea);
    float alpine = smoothstep(uSnowLine * 0.55, uSnowLine, aboveSea);

    vec3 low = mix(C_GRASS, C_STEPPE, smoothstep(120.0, 480.0, aboveSea));
    vec3 ground = mix(C_SAND, low, lowland);
    ground = mix(ground, C_SCREE, upland * 0.75);
    ground = mix(ground, C_ROCK, rockiness * 0.85);
    // Wet sand only within the swash band, so the shoreline reads as damp.
    float swash = 1.0 - smoothstep(0.0, 0.9, aboveSea);
    ground = mix(ground, C_WET_SAND, swash * 0.75);
    // Salt pan / playa in low flat basins.
    float playa = smoothstep(0.55, 0.9, 1.0 - slope) * (1.0 - smoothstep(6.0, 40.0, aboveSea));
    ground = mix(ground, C_SALT, playa * 0.5);
    // Cliffs get their own darker lithology regardless of height.
    ground = mix(ground, C_CLIFF, smoothstep(0.55, 0.85, slope));
    // Snow accumulates on flatter, higher ground; steep faces stay bare.
    float snowRetain = smoothstep(0.94, 0.62, slope) * smoothstep(uSnowLine * 0.8, uSnowLine * 1.25, aboveSea);
    snowRetain = max(snowRetain, alpine * smoothstep(0.94, 0.7, slope) * 0.85);
    ground = mix(ground, C_SNOW, clamp(snowRetain, 0.0, 1.0));
    ground = mix(ground, C_ICE, clamp(snowRetain * smoothstep(0.35, 0.9, 1.0 - vCurvature), 0.0, 0.4));
    albedo = mix(ground, C_SAND, beach * 0.55);
  }

  // Lighting: sun + hemispherical sky, no shadow maps (a 300 km planet cannot
  // afford one cascade set; cavity AO plus terrain self-shading carries it).
  vec3 L = normalize(uSunDir);
  float ndl = max(0.0, dot(N, L));
  vec3 diffuse = albedo * (vec3(0.94, 0.95, 1.0) * uAmbient + vec3(1.0, 0.95, 0.86) * ndl * 1.35);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(L + V);
  float spec = pow(max(0.0, dot(N, H)), 22.0) * 0.045 * (1.0 - rockiness);
  vec3 colour = diffuse * ao + vec3(1.0, 0.95, 0.87) * spec;
  colour += skyRadiance(reflect(-V, N)) * 0.06 * (1.0 - rockiness) * ao;

  // Aerial perspective. Keeps a continent readable at 200 km without a fog wall.
  float fog = 1.0 - exp(-pow(vViewDistance * uFogDensity, 1.35));
  vec3 horizon = skyRadiance(normalize(vec3(-V.x, 0.06, -V.z)));
  colour = mix(colour, mix(horizon, uFogColor, 0.55), clamp(fog, 0.0, 0.94));

  gl_FragColor = vec4(colour, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Ocean
// ---------------------------------------------------------------------------

export const OCEAN_VERTEX = /* glsl */`
precision highp float;

${OCEAN_WAVE_GLSL}

// Simulation state (depth, foam, velocity) and the authored bed.
uniform sampler2D uStateTex;
uniform sampler2D uBedTex;
uniform vec4 uDomain;     // textureSize, cellSize m, span m, sea level m
uniform vec3 uOceanOrigin; // x, 0, z — the simulation window follows the camera
uniform float uShoalMax;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vDepth;
varying float vFoam;
varying float vCrest;
varying vec2 vBedUv;

vec4 stateAt(ivec2 c) {
  ivec2 cc = clamp(c, ivec2(0), ivec2(int(uDomain.x) - 1));
  return texelFetch(uStateTex, cc, 0);
}

void main() {
  ivec2 c = clamp(ivec2(uv * (uDomain.x - 1.0) + 0.5), ivec2(0), ivec2(int(uDomain.x) - 1));
  vec4 state = texelFetch(uStateTex, c, 0);
  float bed = texelFetch(uBedTex, c, 0).r;
  float depth = max(0.0, state.r);

  // Local plane position -> world metres.
  vec3 world = position;
  world.xz += uOceanOrigin.xz;

  // Shoaling: full swell in open water, flattened in the last few metres so the
  // surface never lifts off the beach.
  float shoal = smoothstep(0.0, uShoalMax, depth);
  WaveSample wave = sampleOcean(world.xz, mix(0.15, 1.0, shoal));
  float lift = smoothstep(0.35, 5.0, depth);
  world.y = uDomain.w + depth + wave.offset.y * lift * 0.75;
  world.xz += wave.offset.xz * lift * 0.5;

  // Grid normals from the simulated *water* surface (the solver stores water
  // height above sea level in state.r — using the bed here would tilt the whole
  // ocean to follow the sea floor), blended with the analytic swell normal so
  // the water reads as moving even where the solver is nearly still.
  float wL = stateAt(c + ivec2(-1, 0)).r;
  float wR = stateAt(c + ivec2(1, 0)).r;
  float wD = stateAt(c + ivec2(0, -1)).r;
  float wU = stateAt(c + ivec2(0, 1)).r;
  vec3 gridNormal = normalize(vec3(wL - wR, 2.0 * uDomain.y, wD - wU));
  vNormalW = normalize(mix(gridNormal, wave.normal, 0.35));

  vWorld = world;
  vDepth = depth;
  vFoam = state.g;
  vCrest = wave.crest;
  vBedUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const OCEAN_FRAGMENT = /* glsl */`
precision highp float;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vDepth;
varying float vFoam;
varying float vCrest;
varying vec2 vBedUv;

uniform sampler2D uBedTex;
uniform sampler2D uStateTex;
uniform float uSeaLevel;
uniform float uClarity;
uniform float uFoamAmount;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uOpacity;

${SKY_GLSL}
${OCEAN_WAVE_GLSL}

void main() {
  float depth = max(0.0, vDepth);
  if (depth < 0.02) discard;

  vec4 bedSample = texture2D(uBedTex, vBedUv);
  float breaker = bedSample.b;
  vec4 state = texture2D(uStateTex, vBedUv);

  // --- Surface normal: simulated grid normal plus per-pixel ripple break-up ---
  float shoal = smoothstep(0.0, 45.0, depth);
  WaveSample detail = sampleOcean(vWorld.xz * 2.3 + 17.0, mix(0.4, 1.0, shoal));
  vec3 N = normalize(vNormalW + detail.normal * 0.38 - vec3(0.0, 1.0, 0.0) * 0.38);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);

  // --- Optical depth: Beer-Lambert, wavelength dependent --------------------
  float clarity = 0.22 + uClarity * 0.78;
  vec3 extinction = vec3(0.62, 0.20, 0.13) / max(0.15, clarity);
  float viewDepth = depth / max(0.22, abs(dot(V, vec3(0.0, 1.0, 0.0))));
  float transmittance = exp(-viewDepth * 0.055 * extinction.r);

  // --- Water body: absorption plus suspended sediment near the coast ---------
  vec3 body = mix(uShallowColor, uDeepColor, smoothstep(0.0, 90.0, viewDepth));
  float turbidity = (1.0 - smoothstep(0.0, 130.0, depth)) * 0.45;
  body = mix(body, mix(uShallowColor, vec3(0.55, 0.62, 0.47), 0.5), turbidity * 0.5);
  body *= mix(1.0, 0.45, smoothstep(0.0, 260.0, viewDepth));

  // --- Fresnel reflection of the analytic sky -------------------------------
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.86 + 0.02;
  vec3 reflection = skyRadiance(normalize(R));
  float fresnel = clamp(0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0), 0.0, 0.95);

  // --- Sun specular: a tight glitter lobe plus a broad sheen -----------------
  vec3 H = normalize(L + V);
  float ndh = max(0.0, dot(N, H));
  vec3 specular = vec3(1.0, 0.96, 0.88) * (pow(ndh, 900.0) * 24.0 + pow(ndh, 60.0) * 0.8);

  // --- Foam: simulated whitewater, breaking crests, shoreline surf ----------
  float crestFoam = smoothstep(0.62, 1.05, vCrest + detail.crest * 0.35);
  // Breakers roll shoreward: the pulse travels into shallower water.
  float surfPulse = 0.62 + 0.38 * sin(uTime * 1.55 - depth * 0.19);
  float surf = smoothstep(0.35, 0.95, breaker * surfPulse * (0.6 + uFoamAmount * 0.7));
  float foam = max(max(vFoam, state.g), max(surf, crestFoam * smoothstep(4.0, 30.0, depth) * 0.5));
  foam = clamp(foam * (0.45 + uFoamAmount), 0.0, 1.0);
  vec3 foamColour = vec3(0.94, 0.96, 0.97) * (0.55 + 0.45 * max(0.0, dot(N, L)));

  vec3 water = mix(body, reflection, fresnel);
  water = mix(water, foamColour, foam * 0.92);
  water += specular * (1.0 - foam * 0.75);

  // --- Composite: opaque where deep, translucent over the shelf -------------
  float alpha = clamp(1.0 - transmittance * 0.7 + fresnel * 0.5 + foam * 0.9, 0.0, 1.0);
  alpha = max(alpha, 0.18) * smoothstep(0.02, 0.5, depth);

  float dist = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  vec3 horizon = skyRadiance(normalize(vec3(-V.x, 0.06, -V.z)));
  water = mix(water, mix(horizon, uFogColor, 0.55), clamp(fog, 0.0, 0.96));

  gl_FragColor = vec4(water, clamp(alpha * uOpacity, 0.0, 1.0));
}
`;

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------

export const SKY_VERTEX = /* glsl */`
precision highp float;
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww; // force depth 1 so the dome is always behind
}
`;

export const SKY_FRAGMENT = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uFogColor;

${SKY_GLSL}

void main() {
  vec3 dir = normalize(vDir);
  vec3 colour = skyRadiance(dir);
  // Below the horizon the dome fades into the same haze the terrain uses.
  float below = smoothstep(0.02, -0.22, dir.y);
  colour = mix(colour, uFogColor, below * 0.85);
  gl_FragColor = vec4(colour, 1.0);
}
`;
