#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vWorldNormal;

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec4 uColor;
uniform vec2 uRoughness; // x roughness, y spec scale

out vec4 fragColor;

vec3 skyGradient(vec3 dir) {
  float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = vec3(0.55, 0.58, 0.63);
  vec3 zenith = vec3(0.12, 0.2, 0.38);
  return mix(horizon, zenith, t);
}

vec3 acesTonemap(vec3 x) {
  float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 lightDir = normalize(uLightDir);
  float ndotl = max(dot(n, lightDir), 0.0);
  vec3 halfV = normalize(lightDir + viewDir);
  float spec = pow(max(dot(n, halfV), 0.0), mix(8.0, 128.0, 1.0 - uRoughness.x)) * uRoughness.y;
  vec3 ambient = skyGradient(n) * 0.55;
  vec3 diffuse = uColor.rgb * (ambient + ndotl * 1.15);
  vec3 col = diffuse + vec3(spec);
  fragColor = vec4(acesTonemap(col), uColor.a);
}
