/*====================================================================================================================================
                                                        FIELD.SHADERS
====================================================================================================================================*/
// 🧩 Slice plane, vector glyph grid, and streamline shaders.

import { FIELD_CHUNK } from './common.js';

export const SLICE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProj;
uniform vec3 uSliceOrigin;
uniform vec3 uSliceU;
uniform vec3 uSliceV;
out vec3 vWorld;
out vec2 vUv;
void main() {
    vec3 world = uSliceOrigin + uSliceU * aPosition.x + uSliceV * aPosition.z;
    vWorld = world;
    vUv = aPosition.xz + 0.5;
    gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const SLICE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
in vec3 vWorld;
in vec2 vUv;
uniform float uSliceMode;
uniform float uSliceScale;
uniform float uSliceOpacity;
uniform float uSliceContours;
uniform float uSliceGain;
out vec4 fragColor;

${FIELD_CHUNK}

void main() {
    vec3 vector = fieldAt(vWorld);
    float magnitude = length(vector);
    float value = magnitude;
    if (uSliceMode > 1.5) {
        value = sampleTerrain(vWorld.xz).g;
    } else if (uSliceMode > 0.5) {
        value = fieldPotential(vWorld);
    }
    float t;
    if (uSliceMode > 0.5 && uSliceMode < 1.5) {
        t = clamp(0.5 + value / max(uSliceScale * 0.5, 0.001) * 0.5, 0.0, 1.0);
    } else {
        t = clamp(value / max(uSliceScale / max(uSliceGain, 0.05), 0.001), 0.0, 1.0);
    }
    vec3 color = rampColor(t);
    float contour = 1.0 - smoothstep(0.0, 0.055, abs(fract(value * 1.8) - 0.5));
    color = mix(color, vec3(0.92, 0.94, 0.84), contour * uSliceContours * 0.38);
    vec2 grid = abs(fract(vWorld.xz * 0.1) - 0.5);
    float gridLine = 1.0 - smoothstep(0.0, 0.025, min(grid.x, grid.y));
    color = mix(color, vec3(0.75, 0.8, 0.72), gridLine * 0.06);
    vec2 edge = abs(vUv - 0.5) * 2.0;
    float edgeFade = smoothstep(1.0, 0.9, max(edge.x, edge.y));
    fragColor = vec4(color, uSliceOpacity * edgeFade);
}
`;

export const GLYPH_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
layout(location = 0) in vec3 aBase;
layout(location = 1) in float aTip;
uniform mat4 uViewProj;
uniform float uGlyphScale;
uniform float uGlyphMax;
out float vMagnitude;

${FIELD_CHUNK}

void main() {
    vec3 p = aBase;
    vec3 vector = fieldAt(p);
    float magnitude = length(vector);
    vMagnitude = magnitude;
    if (aTip > 0.5) {
        vec3 direction = normalize(vector + vec3(0.0001, 0.0002, 0.0003));
        p += direction * uGlyphScale * (0.35 + 0.65 * clamp(magnitude / max(uGlyphMax, 0.001), 0.0, 1.0));
    }
    gl_Position = uViewProj * vec4(p, 1.0);
}
`;

export const GLYPH_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
in float vMagnitude;
uniform float uGlyphMax;
uniform float uGlyphOpacity;
out vec4 fragColor;

${FIELD_CHUNK}

void main() {
    float t = clamp(vMagnitude / max(uGlyphMax, 0.001), 0.0, 1.0);
    vec3 color = rampColor(t);
    fragColor = vec4(color, uGlyphOpacity);
}
`;

export const STREAMLINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
uniform mat4 uViewProj;
out vec3 vColor;
void main() {
    vColor = aColor;
    gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const STREAMLINE_FS = `#version 300 es
precision highp float;
in vec3 vColor;
uniform float uOpacity;
out vec4 fragColor;
void main() {
    fragColor = vec4(vColor, uOpacity);
}
`;
