#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vWorldCenter;
in float vRadius;
in float vMatIdx;
in float vContact;
in float vSpeed;

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec4 uMatColorR; // per-material color.r packed by index
uniform vec4 uMatColorG;
uniform vec4 uMatColorB;
uniform vec4 uMatRoughness;
uniform vec4 uMatOpacity;

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

float fresnelSchlick(float cosTheta, float f0) {
  float c = clamp(1.0 - cosTheta, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(c, 5.0);
}

vec4 pick(vec4 v, int i) {
  if (i == 0) return vec4(v.x);
  if (i == 1) return vec4(v.y);
  if (i == 2) return vec4(v.z);
  return vec4(v.w);
}

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float z = sqrt(1.0 - r2);
  vec3 normal = normalize(uCameraRight * vUv.x + uCameraUp * vUv.y - uCameraForward * z);

  vec3 surfacePos = vWorldCenter + normal * vRadius;
  vec4 reprojected = uViewProj * vec4(surfacePos, 1.0);
  float ndcZ = reprojected.z / reprojected.w;
  gl_FragDepth = clamp(ndcZ * 0.5 + 0.5, 0.0, 1.0);

  int idx = int(vMatIdx + 0.5);
  float cr = pick(uMatColorR, idx).x;
  float cg = pick(uMatColorG, idx).x;
  float cb = pick(uMatColorB, idx).x;
  float roughness = pick(uMatRoughness, idx).x;
  float opacity = pick(uMatOpacity, idx).x;
  vec3 color = vec3(cr, cg, cb);

  vec3 lightDir = normalize(uLightDir);
  vec3 viewDir = normalize(uCameraPos - surfacePos);
  float ndotl = max(dot(normal, lightDir), 0.0);
  float ndotv = max(dot(normal, viewDir), 0.0);
  vec3 halfV = normalize(lightDir + viewDir);
  float shininess = mix(96.0, 8.0, roughness);
  float spec = pow(max(dot(normal, halfV), 0.0), shininess);
  float fres = fresnelSchlick(ndotv, 0.04);

  vec3 ambient = skyGradient(normal) * 0.6;
  float wet = mix(1.0, 1.35, vContact);
  vec3 base = color * (ambient + ndotl * 1.2) * wet;
  float specStrength = mix(0.15, 0.85, 1.0 - roughness) + vContact * 0.2;
  vec3 col = base + vec3(spec) * specStrength + skyGradient(reflect(-viewDir, normal)) * fres * 0.5;

  float speedTint = clamp(vSpeed * 0.015, 0.0, 0.12);
  col += vec3(speedTint * 0.3, speedTint * 0.3, speedTint * 0.5);

  float edgeFade = 1.0 - smoothstep(0.7, 1.0, r2);
  float alpha = clamp(opacity * edgeFade, 0.0, 1.0);
  fragColor = vec4(acesTonemap(col), alpha);
}
