/*====================================================================================================================================
                                                        VEGETATION.SHADERS
====================================================================================================================================*/
// 🧩 Vegetation blades, force-source glows, probe marker, and ground grid.

export const VEGETATION_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aBase;
layout(location = 1) in vec4 aParams;
uniform mat4 uViewProj;
uniform float uTime;
uniform float uDensity;
uniform float uHeight;
uniform float uSway;
uniform float uWindSpeed;
uniform vec3 uWindDir;
out float vTint;
out float vHeight;
void main() {
    float visible = smoothstep(uDensity - 0.04, uDensity + 0.04, aParams.w);
    float bladeHeight = uHeight * aParams.x * visible;
    float tip = float(gl_VertexID - (gl_VertexID / 2) * 2);
    vec3 p = aBase;
    float sway = sin(uTime * 1.7 + aParams.y) * uSway * 0.42 * tip * (0.45 + uWindSpeed * 0.018);
    p.x += sway * uWindDir.x + sway * 0.25;
    p.z += sway * uWindDir.z;
    p.y += bladeHeight * tip;
    vTint = aParams.z;
    vHeight = tip;
    gl_Position = uViewProj * vec4(p, 1.0);
}
`;

export const VEGETATION_FS = `#version 300 es
precision highp float;
in float vTint;
in float vHeight;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 fragColor;
void main() {
    vec3 base = uColor * (0.55 + 0.45 * vTint);
    vec3 tip = mix(base, vec3(0.72, 0.82, 0.52), 0.38);
    vec3 color = mix(base, tip, vHeight);
    float alpha = uOpacity * (0.28 + 0.72 * vHeight);
    if (alpha < 0.003) discard;
    fragColor = vec4(color, alpha);
}
`;

export const SOURCE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aSize;
uniform mat4 uViewProj;
uniform float uPixelRatio;
out vec3 vColor;
void main() {
    vec4 clip = uViewProj * vec4(aPosition, 1.0);
    gl_Position = clip;
    gl_PointSize = aSize * uPixelRatio * (140.0 / max(1.0, clip.w));
    vColor = aColor;
}
`;

export const SOURCE_FS = `#version 300 es
precision highp float;
in vec3 vColor;
uniform float uOpacity;
out vec4 fragColor;
void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float core = smoothstep(0.42, 0.0, r);
    float halo = smoothstep(1.0, 0.12, r) * 0.32;
    float alpha = (core + halo) * uOpacity;
    if (alpha < 0.003) discard;
    fragColor = vec4(vColor, alpha);
}
`;

export const PROBE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProj;
void main() {
    gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const PROBE_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 fragColor;
void main() {
    fragColor = vec4(uColor, uOpacity);
}
`;

export const GRID_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProj;
out float vDistance;
void main() {
    vDistance = length(aPosition.xz);
    gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const GRID_FS = `#version 300 es
precision highp float;
in float vDistance;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uExtent;
out vec4 fragColor;
void main() {
    float fade = 1.0 - smoothstep(uExtent * 0.18, uExtent * 0.5, vDistance);
    float alpha = uOpacity * fade;
    if (alpha < 0.003) discard;
    fragColor = vec4(uColor, alpha);
}
`;
