#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uViewProj;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vWorldNormal;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPos = world.xyz;
  mat3 normalMat = mat3(uModel);
  vWorldNormal = normalize(normalMat * aNormal);
  gl_Position = uViewProj * world;
}
