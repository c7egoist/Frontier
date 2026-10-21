#version 300 es
out vec2 vUv;
void main() {
  vec2 uv = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = uv;
  vec2 pos = uv * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
