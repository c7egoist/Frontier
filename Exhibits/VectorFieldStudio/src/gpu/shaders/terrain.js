/*====================================================================================================================================
                                                        TERRAIN.SHADERS
====================================================================================================================================*/
// 🧩 Terrain surface and water plane shading.

import { FIELD_CHUNK } from './common.js';

export const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
uniform mat4 uViewProj;
uniform float uTerrainSize;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUv;
void main() {
    vWorld = aPosition;
    vNormal = aNormal;
    vColor = aColor;
    vUv = aPosition.xz / uTerrainSize + 0.5;
    gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec2 vUv;
uniform sampler2D uTerrainData;
uniform float uTerrainHeight;
uniform float uSeaLevel;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform float uOpacity;
uniform float uContours;
uniform vec3 uPaletteLow;
uniform vec3 uPaletteMid;
uniform vec3 uPaletteHigh;
uniform vec3 uPalettePeak;
uniform vec3 uFogColor;
uniform float uFogDensity;
out vec4 fragColor;
void main() {
    vec4 data = texture(uTerrainData, vUv);
    float height = vWorld.y / max(uTerrainHeight, 0.001);
    float flow = data.g;
    float vegetation = data.b;
    float moisture = data.a;
    vec3 normal = normalize(vNormal);
    vec3 base = vColor;
    vec3 palette = mix(uPaletteLow, uPaletteMid, smoothstep(0.04, 0.42, height));
    palette = mix(palette, uPaletteHigh, smoothstep(0.42, 0.74, height));
    palette = mix(palette, uPalettePeak, smoothstep(0.74, 0.96, height));
    base = mix(base, palette, 0.32);
    base = mix(base, vec3(0.16, 0.30, 0.14), vegetation * 0.38);
    base *= mix(1.0, 0.82, moisture * 0.55);
    float water = 1.0 - smoothstep(uSeaLevel - 0.015, uSeaLevel + 0.025, height);
    base = mix(base, vec3(0.09, 0.18, 0.22), water * 0.7);
    vec3 lightDir = normalize(uSunDir);
    float diffuse = max(dot(normal, lightDir), 0.0);
    float sky = 0.5 + 0.5 * normal.y;
    vec3 lit = base * (0.34 + 0.78 * diffuse) + base * sky * 0.16;
    vec3 viewDir = normalize(uEye - vWorld);
    vec3 halfDir = normalize(lightDir + viewDir);
    float specular = pow(max(dot(normal, halfDir), 0.0), 42.0) * 0.12;
    lit += vec3(specular);
    float contour = 1.0 - smoothstep(0.0, 0.055, abs(fract(height * 26.0) - 0.5));
    lit = mix(lit, lit * 0.58, contour * uContours * 0.42);
    float channel = smoothstep(0.52, 0.94, flow);
    lit = mix(lit, vec3(0.13, 0.31, 0.35), channel * 0.38);
    float distanceToEye = length(uEye - vWorld);
    float fog = 1.0 - exp(-distanceToEye * uFogDensity);
    lit = mix(lit, uFogColor, clamp(fog, 0.0, 0.82));
    fragColor = vec4(lit, uOpacity);
}
`;

export const WATER_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProj;
uniform float uWaterLevel;
out vec3 vWorld;
void main() {
    vec3 world = vec3(aPosition.x, uWaterLevel, aPosition.z);
    vWorld = world;
    gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const WATER_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uWaterLevel;
uniform float uOpacity;
uniform sampler2D uTerrainData;
uniform float uTerrainHeight;
uniform float uTerrainSize;
out vec4 fragColor;
void main() {
    vec2 p = vWorld.xz;
    float ripple = sin(p.x * 0.42 + uTime * 0.7) * 0.5 + sin(p.y * 0.31 - uTime * 0.52) * 0.5;
    float ripple2 = sin((p.x + p.y) * 0.19 + uTime * 0.31) * 0.5;
    vec3 normal = normalize(vec3(ripple * 0.06 + ripple2 * 0.03, 1.0, ripple2 * 0.05));
    vec3 viewDir = normalize(uEye - vWorld);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
    vec3 color = mix(vec3(0.035, 0.09, 0.11), vec3(0.14, 0.28, 0.31), fresnel);
    vec2 uv = p / uTerrainSize + 0.5;
    float ground = 0.0;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        ground = texture(uTerrainData, uv).r * uTerrainHeight;
    }
    float depth = uWaterLevel - ground;
    float alpha = smoothstep(0.0, 1.1, depth) * uOpacity;
    vec3 lightDir = normalize(uSunDir);
    vec3 halfDir = normalize(lightDir + viewDir);
    float specular = pow(max(dot(normal, halfDir), 0.0), 90.0) * 0.45;
    color += vec3(specular);
    float distanceToEye = length(uEye - vWorld);
    float fog = 1.0 - exp(-distanceToEye * 0.0022);
    color = mix(color, vec3(0.035, 0.045, 0.04), clamp(fog, 0.0, 0.7));
    fragColor = vec4(color, alpha);
}
`;
