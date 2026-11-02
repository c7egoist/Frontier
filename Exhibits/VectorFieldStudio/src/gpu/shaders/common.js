/*====================================================================================================================================
                                                        COMMON.JS
====================================================================================================================================*/
// 🧩 Shared GLSL chunks: fullscreen triangle, field uniforms, noise sampling, and colour ramps.

export const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = corner;
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FIELD_CHUNK = `
precision highp float;
precision highp int;
precision highp sampler3D;

#define MAX_FORCE_SOURCES 8
#define PI 3.14159265359

uniform int uMode;                 // 0 wind, 1 force, 2 terrain
uniform float uTime;
uniform sampler2D uTerrainData;
uniform sampler3D uNoise3D;
uniform float uTerrainSize;
uniform float uTerrainHeight;
uniform float uBoundsY;

uniform vec3 uWindDir;
uniform float uWindSpeed;
uniform float uTurbulence;
uniform float uCurlScale;
uniform float uLift;
uniform float uTerrainCoupling;

uniform vec3 uForceBackground;
uniform float uForceStrength;
uniform float uForceRadius;
uniform float uForceFalloff;
uniform int uForceCount;
uniform vec4 uForceSources[MAX_FORCE_SOURCES];
uniform float uForceKinds[MAX_FORCE_SOURCES];

uniform float uFlowSpeed;
uniform float uFlowTurbulence;

uniform vec3 uRamp[5];

vec3 rampColor(float t) {
    t = clamp(t, 0.0, 1.0);
    float scaled = t * 4.0;
    int index = int(min(floor(scaled), 3.0));
    float local = scaled - float(index);
    if (index == 0) return mix(uRamp[0], uRamp[1], local);
    if (index == 1) return mix(uRamp[1], uRamp[2], local);
    if (index == 2) return mix(uRamp[2], uRamp[3], local);
    return mix(uRamp[3], uRamp[4], local);
}

vec2 terrainUv(vec2 xz) {
    return xz / uTerrainSize + 0.5;
}

float sampleTerrainHeight(vec2 xz) {
    vec2 uv = terrainUv(xz);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture(uTerrainData, uv).r * uTerrainHeight;
}

vec4 sampleTerrain(vec2 xz) {
    vec2 uv = terrainUv(xz);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture(uTerrainData, uv);
}

vec3 curlNoise(vec3 p) {
    float e = 0.012;
    vec3 px1 = texture(uNoise3D, p + vec3(e, 0.0, 0.0)).rgb;
    vec3 px0 = texture(uNoise3D, p - vec3(e, 0.0, 0.0)).rgb;
    vec3 py1 = texture(uNoise3D, p + vec3(0.0, e, 0.0)).rgb;
    vec3 py0 = texture(uNoise3D, p - vec3(0.0, e, 0.0)).rgb;
    vec3 pz1 = texture(uNoise3D, p + vec3(0.0, 0.0, e)).rgb;
    vec3 pz0 = texture(uNoise3D, p - vec3(0.0, 0.0, e)).rgb;
    float cx = (py1.z - py0.z) - (pz1.y - pz0.y);
    float cy = (pz1.x - pz0.x) - (px1.z - px0.z);
    float cz = (px1.y - px0.y) - (py1.x - py0.x);
    return vec3(cx, cy, cz) * (0.02 / (2.0 * e));
}

vec3 windField(vec3 p) {
    float ground = sampleTerrainHeight(p.xz);
    float h = clamp((p.y - ground) / max(uBoundsY, 1.0), 0.0, 1.0);
    float profile = mix(0.35, 1.0, smoothstep(0.0, 0.55, h));
    vec3 v = uWindDir * uWindSpeed * profile;
    vec3 c = curlNoise(p * uCurlScale + vec3(0.0, uTime * 0.02, 0.0));
    v += c * uTurbulence * 6.0;
    float e = 1.5;
    float hX = sampleTerrainHeight(p.xz + vec2(e, 0.0));
    float hZ = sampleTerrainHeight(p.xz + vec2(0.0, e));
    vec2 grad = vec2(hX - ground, hZ - ground) / e;
    float slope = length(grad);
    v.y += uLift * (slope * 8.0 + 0.4) * smoothstep(0.0, 12.0, p.y - ground);
    v.xz -= grad * uTerrainCoupling * 10.0;
    v.y += max(0.0, ground + 1.0 - p.y) * 3.0;
    return v;
}

vec3 forceField(vec3 p) {
    vec3 v = uForceBackground * uForceStrength;
    for (int i = 0; i < MAX_FORCE_SOURCES; i++) {
        if (i >= uForceCount) break;
        vec4 source = uForceSources[i];
        float kind = uForceKinds[i];
        vec3 d = p - source.xyz;
        float r2 = dot(d, d) + 0.25;
        float r = sqrt(r2);
        float radius = max(0.5, uForceRadius);
        float falloff = pow(radius / (r + radius * 0.15), uForceFalloff);
        falloff *= smoothstep(0.0, 1.0, 1.0 - r / (radius * 4.0));
        vec3 dir = d / max(r, 0.0001);
        float strength = source.w * falloff;
        if (kind < 0.5) {
            v -= dir * strength * 12.0;
        } else if (kind < 1.5) {
            v += dir * strength * 12.0;
        } else {
            vec3 tangent = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(0.0001, 0.0, 0.0));
            v += tangent * strength * 14.0 + dir * strength * 2.0;
        }
    }
    return v;
}

vec3 terrainFlowField(vec3 p) {
    float e = 1.0;
    float hC = sampleTerrainHeight(p.xz);
    float hX = sampleTerrainHeight(p.xz + vec2(e, 0.0));
    float hZ = sampleTerrainHeight(p.xz + vec2(0.0, e));
    vec2 grad = vec2(hX - hC, hZ - hC) / e;
    vec3 v = vec3(-grad.x, 0.0, -grad.y) * uFlowSpeed * 12.0;
    vec3 c = curlNoise(p * 0.08 + vec3(0.0, uTime * 0.01, 0.0));
    v.x += c.x * uFlowTurbulence * 0.8;
    v.z += c.z * uFlowTurbulence * 0.8;
    return v;
}

vec3 fieldAt(vec3 p) {
    if (uMode == 0) return windField(p);
    if (uMode == 1) return forceField(p);
    return terrainFlowField(p);
}

float fieldPotential(vec3 p) {
    float potential = 0.0;
    for (int i = 0; i < MAX_FORCE_SOURCES; i++) {
        if (i >= uForceCount) break;
        if (uForceKinds[i] > 1.5) continue;
        vec3 d = p - uForceSources[i].xyz;
        float r = sqrt(dot(d, d) + 0.25);
        potential += (uForceKinds[i] < 0.5 ? -uForceSources[i].w : uForceSources[i].w) / max(r, 0.0001);
    }
    return potential;
}

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

vec3 hash31(float p) {
    vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
}
`;

export const BACKGROUND_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
void main() {
    float y = vUv.y;
    vec3 color = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, y));
    vec2 centered = vUv - 0.5;
    float vignette = smoothstep(0.85, 0.25, length(centered * vec2(1.2, 1.0)));
    color *= mix(0.82, 1.0, vignette);
    fragColor = vec4(color, 1.0);
}
`;
