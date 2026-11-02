/*====================================================================================================================================
                                                        PARTICLE.SHADERS
====================================================================================================================================*/
// 🧩 GPU particle advection, streak rasterisation, and precipitation integration.

import { FIELD_CHUNK } from './common.js';

export const PARTICLE_UPDATE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outPrevious;
uniform sampler2D uState;
uniform sampler2D uPrevious;
uniform float uDt;
uniform float uLife;
uniform float uSurfaceLock;
uniform float uSeed;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;

${FIELD_CHUNK}

vec3 respawnPosition(float seed) {
    float r1 = hash11(seed * 1.13 + 0.71);
    float r2 = hash11(seed * 2.71 + 1.37);
    float r3 = hash11(seed * 3.37 + 2.11);
    if (uMode == 2) {
        vec3 p = vec3(mix(uBoundsMin.x, uBoundsMax.x, r1), 0.0, mix(uBoundsMin.z, uBoundsMax.z, r2));
        p.y = sampleTerrainHeight(p.xz) + 0.35;
        return p;
    }
    return vec3(
        mix(uBoundsMin.x, uBoundsMax.x, r1),
        mix(uBoundsMin.y, uBoundsMax.y, r3),
        mix(uBoundsMin.z, uBoundsMax.z, r2)
    );
}

void main() {
    ivec2 index = ivec2(gl_FragCoord.xy);
    vec4 state = texelFetch(uState, index, 0);
    vec4 previous = texelFetch(uPrevious, index, 0);
    vec3 p = state.xyz;
    float age = state.w;
    float seed = previous.w;
    vec3 velocity = fieldAt(p);
    vec3 next = p + velocity * uDt;
    float ground = sampleTerrainHeight(next.xz);
    if (uSurfaceLock > 0.5) {
        next.y = ground + 0.35;
    } else {
        next.y = max(next.y, ground + 0.25);
    }
    age += uDt;
    bool outside = next.y < uBoundsMin.y || next.y > uBoundsMax.y ||
        abs(next.x) > uBoundsMax.x || abs(next.z) > uBoundsMax.z;
    if (age > uLife || outside) {
        seed = hash11(seed + uTime * 0.017 + float(index.x) * 0.013 + float(index.y) * 0.007 + uSeed);
        next = respawnPosition(seed);
        age = 0.0;
    }
    outState = vec4(next, age);
    outPrevious = vec4(p, seed);
}
`;

export const PARTICLE_RENDER_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
uniform sampler2D uState;
uniform sampler2D uPrevious;
uniform mat4 uViewProj;
uniform vec2 uResolution;
uniform float uDt;
uniform float uStreak;
uniform float uWidth;
uniform float uLife;
uniform float uOpacity;
uniform float uMaxSpeed;
uniform float uPixelRatio;

${FIELD_CHUNK}

out float vT;
out float vSide;
out float vAlpha;
out vec3 vColor;

void main() {
    int index = gl_VertexID / 6;
    int corner = gl_VertexID - index * 6;
    ivec2 size = textureSize(uState, 0);
    ivec2 coord = ivec2(index - (index / size.x) * size.x, index / size.x);
    vec4 state = texelFetch(uState, coord, 0);
    vec4 previous = texelFetch(uPrevious, coord, 0);
    vec3 p = state.xyz;
    float age = state.w;
    vec3 delta = p - previous.xyz;
    float lengthDelta = length(delta);
    float speed = lengthDelta / max(uDt, 0.008);
    float along = (corner == 1 || corner == 3 || corner == 4) ? 1.0 : 0.0;
    float side = (corner == 0 || corner == 1 || corner == 3) ? -0.5 : 0.5;
    vT = along;
    vSide = side;
    float fadeIn = smoothstep(0.0, 0.5, age);
    float fadeOut = 1.0 - smoothstep(uLife * 0.72, uLife, age);
    vAlpha = fadeIn * fadeOut * uOpacity;
    if (lengthDelta < 0.0004 || lengthDelta > 9.0) {
        vAlpha = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec3 direction = delta / lengthDelta;
    float streak = min(lengthDelta * uStreak, 9.0);
    vec3 start = p - direction * streak;
    vec4 clipStart = uViewProj * vec4(start, 1.0);
    vec4 clipEnd = uViewProj * vec4(p, 1.0);
    if (clipStart.w <= 0.05 || clipEnd.w <= 0.05) {
        vAlpha = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec2 screenStart = clipStart.xy / clipStart.w * uResolution * 0.5;
    vec2 screenEnd = clipEnd.xy / clipEnd.w * uResolution * 0.5;
    vec2 screenDelta = screenEnd - screenStart;
    float screenLength = length(screenDelta);
    vec2 screenDirection = screenLength > 0.0001 ? screenDelta / screenLength : vec2(1.0, 0.0);
    vec2 perpendicular = vec2(-screenDirection.y, screenDirection.x);
    vec4 clip = mix(clipStart, clipEnd, along);
    vec2 offset = perpendicular * side * (uWidth * uPixelRatio) * 2.0 / uResolution;
    clip.xy += offset * clip.w;
    gl_Position = clip;
    float t;
    if (uMode == 2) {
        t = texture(uTerrainData, p.xz / uTerrainSize + 0.5).g;
    } else {
        t = clamp(speed / max(uMaxSpeed, 0.001), 0.0, 1.0);
    }
    vColor = rampColor(t);
}
`;

export const PARTICLE_RENDER_FS = `#version 300 es
precision highp float;
in float vT;
in float vSide;
in float vAlpha;
in vec3 vColor;
out vec4 fragColor;
void main() {
    float edge = smoothstep(0.5, 0.08, abs(vSide));
    float along = smoothstep(0.0, 0.28, vT);
    float alpha = vAlpha * edge * along;
    if (alpha < 0.003) discard;
    fragColor = vec4(vColor, alpha);
}
`;

export const RAIN_UPDATE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outPrevious;
uniform sampler2D uState;
uniform sampler2D uPrevious;
uniform float uDt;
uniform float uFallSpeed;
uniform float uWindCoupling;
uniform float uIntensity;
uniform float uBoundsY;
uniform vec3 uWindDir;
uniform float uTime;
uniform sampler2D uTerrainData;
uniform float uTerrainHeight;
uniform float uTerrainSize;

float sampleGround(vec2 xz) {
    vec2 uv = xz / uTerrainSize + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture(uTerrainData, uv).r * uTerrainHeight;
}

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

void main() {
    ivec2 index = ivec2(gl_FragCoord.xy);
    vec4 state = texelFetch(uState, index, 0);
    vec4 previous = texelFetch(uPrevious, index, 0);
    vec3 p = state.xyz;
    float age = state.w;
    float seed = previous.w;
    vec3 velocity = vec3(uWindDir.x, 0.0, uWindDir.z) * uWindCoupling * 12.0 + vec3(0.0, -uFallSpeed, 0.0);
    vec3 next = p + velocity * uDt;
    float ground = sampleGround(next.xz);
    age += uDt;
    bool outside = next.y < ground + 0.1 || next.y > uBoundsY || abs(next.x) > uTerrainSize * 0.5 || abs(next.z) > uTerrainSize * 0.5;
    if (age > 8.0 || outside) {
        float r1 = hash11(seed + uTime * 0.011 + float(index.x) * 0.017);
        float r2 = hash11(seed + uTime * 0.013 + float(index.y) * 0.019);
        next = vec3(
            mix(-uTerrainSize * 0.48, uTerrainSize * 0.48, r1),
            uBoundsY * (0.72 + 0.28 * r2),
            mix(-uTerrainSize * 0.48, uTerrainSize * 0.48, r2)
        );
        age = 0.0;
        seed = hash11(seed + 1.37 + uTime * 0.01);
    }
    outState = vec4(next, age);
    outPrevious = vec4(p, seed);
}
`;

export const RAIN_RENDER_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uState;
uniform sampler2D uPrevious;
uniform mat4 uViewProj;
uniform vec2 uResolution;
uniform float uDt;
uniform float uStreak;
uniform float uWidth;
uniform float uOpacity;
uniform float uIntensity;
uniform float uPixelRatio;
uniform vec3 uColor;
out float vT;
out float vSide;
out float vAlpha;
out vec3 vColor;
void main() {
    int index = gl_VertexID / 6;
    int corner = gl_VertexID - index * 6;
    ivec2 size = textureSize(uState, 0);
    ivec2 coord = ivec2(index - (index / size.x) * size.x, index / size.x);
    vec4 state = texelFetch(uState, coord, 0);
    vec4 previous = texelFetch(uPrevious, coord, 0);
    vec3 p = state.xyz;
    vec3 delta = p - previous.xyz;
    float lengthDelta = length(delta);
    float along = (corner == 1 || corner == 3 || corner == 4) ? 1.0 : 0.0;
    float side = (corner == 0 || corner == 1 || corner == 3) ? -0.5 : 0.5;
    vT = along;
    vSide = side;
    vAlpha = uOpacity * uIntensity;
    vColor = uColor;
    if (lengthDelta < 0.0002 || lengthDelta > 9.0) {
        vAlpha = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec3 direction = delta / lengthDelta;
    float streak = min(lengthDelta * uStreak, 6.0);
    vec3 start = p - direction * streak;
    vec4 clipStart = uViewProj * vec4(start, 1.0);
    vec4 clipEnd = uViewProj * vec4(p, 1.0);
    if (clipStart.w <= 0.05 || clipEnd.w <= 0.05) {
        vAlpha = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec2 screenStart = clipStart.xy / clipStart.w * uResolution * 0.5;
    vec2 screenEnd = clipEnd.xy / clipEnd.w * uResolution * 0.5;
    vec2 screenDelta = screenEnd - screenStart;
    float screenLength = length(screenDelta);
    vec2 screenDirection = screenLength > 0.0001 ? screenDelta / screenLength : vec2(0.0, 1.0);
    vec2 perpendicular = vec2(-screenDirection.y, screenDirection.x);
    vec4 clip = mix(clipStart, clipEnd, along);
    vec2 offset = perpendicular * side * (uWidth * uPixelRatio) * 2.0 / uResolution;
    clip.xy += offset * clip.w;
    gl_Position = clip;
}
`;

export const RAIN_RENDER_FS = `#version 300 es
precision highp float;
in float vT;
in float vSide;
in float vAlpha;
in vec3 vColor;
out vec4 fragColor;
void main() {
    float edge = smoothstep(0.5, 0.1, abs(vSide));
    float along = smoothstep(0.0, 0.35, vT);
    float alpha = vAlpha * edge * along;
    if (alpha < 0.003) discard;
    fragColor = vec4(vColor, alpha);
}
`;
