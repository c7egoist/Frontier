// Shared camera uniform + lighting helpers for every WebGPU render pass.

struct Camera {
  viewProj     : mat4x4<f32>,
  invViewProj  : mat4x4<f32>,
  view         : mat4x4<f32>,
  proj         : mat4x4<f32>,
  cameraPos    : vec4<f32>,
  cameraRight  : vec4<f32>,
  cameraUp     : vec4<f32>,
  cameraForward: vec4<f32>,
  lightDir     : vec4<f32>,
  params       : vec4<f32>, // x = time, y = aspect, z = near, w = far
};

fn fresnelSchlick(cosTheta: f32, f0: f32) -> f32 {
  let c = clamp(1.0 - cosTheta, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(c, 5.0);
}

fn acesTonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn skyGradient(dir: vec3<f32>) -> vec3<f32> {
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  let horizon = vec3<f32>(0.55, 0.58, 0.63);
  let zenith = vec3<f32>(0.12, 0.2, 0.38);
  return mix(horizon, zenith, t);
}
