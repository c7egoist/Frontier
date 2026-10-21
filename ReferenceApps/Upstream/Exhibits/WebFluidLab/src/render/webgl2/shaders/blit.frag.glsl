#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 fragColor;
void main() {
  vec4 center = texture(uSrc, vUv);
  vec4 n = texture(uSrc, vUv + vec2(0.0, -uTexel.y));
  vec4 s = texture(uSrc, vUv + vec2(0.0, uTexel.y));
  vec4 e = texture(uSrc, vUv + vec2(uTexel.x, 0.0));
  vec4 w = texture(uSrc, vUv + vec2(-uTexel.x, 0.0));
  vec4 blur = (n + s + e + w) * 0.25;
  vec4 sharpened = center + (center - blur) * 0.35;
  fragColor = vec4(clamp(sharpened.rgb, 0.0, 1.0), 1.0);
}
