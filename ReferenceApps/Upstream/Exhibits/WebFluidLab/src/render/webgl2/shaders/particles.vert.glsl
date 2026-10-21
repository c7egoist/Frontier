#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aData0; // pos.xyz, matIdx
layout(location = 2) in vec4 aData1; // velLen, contact, 0, 0

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec4 uMatRadius; // per-material particle radius, indexed by matIdx

out vec2 vUv;
out vec3 vWorldCenter;
out float vRadius;
out float vMatIdx;
out float vContact;
out float vSpeed;

float radiusFor(float idx) {
  int i = int(idx + 0.5);
  if (i == 0) return uMatRadius.x;
  if (i == 1) return uMatRadius.y;
  if (i == 2) return uMatRadius.z;
  return uMatRadius.w;
}

void main() {
  vec3 center = aData0.xyz;
  float matIdx = aData0.w;
  float radius = radiusFor(matIdx);
  vec3 worldCorner = center + uCameraRight * aCorner.x * radius * 1.35 + uCameraUp * aCorner.y * radius * 1.35;

  vUv = aCorner;
  vWorldCenter = center;
  vRadius = radius;
  vMatIdx = matIdx;
  vSpeed = aData1.x;
  vContact = aData1.y;

  gl_Position = uViewProj * vec4(worldCorner, 1.0);
}
