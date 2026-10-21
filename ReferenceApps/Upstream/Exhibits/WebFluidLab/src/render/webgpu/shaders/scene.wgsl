// Forward-shaded pass for the tank floor/walls and the analytic colliders
// (sphere, box, paddle). Simple Lambert + Blinn-Phong + sky ambient so the
// fluid has believable objects to collide with, refract against and coat.

struct ObjectUniform {
  model     : mat4x4<f32>,
  color     : vec4<f32>,
  roughness : vec4<f32>, // x roughness, y metallic-ish spec scale, zw unused
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var<uniform> object : ObjectUniform;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) worldNormal : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VsOut {
  var out: VsOut;
  let world = object.model * vec4<f32>(position, 1.0);
  out.worldPos = world.xyz;
  let normalMat = mat3x3<f32>(object.model[0].xyz, object.model[1].xyz, object.model[2].xyz);
  out.worldNormal = normalize(normalMat * normal);
  out.clip = camera.viewProj * world;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let n = normalize(in.worldNormal);
  let viewDir = normalize(camera.cameraPos.xyz - in.worldPos);
  let lightDir = normalize(camera.lightDir.xyz);
  let ndotl = max(dot(n, lightDir), 0.0);
  let halfV = normalize(lightDir + viewDir);
  let spec = pow(max(dot(n, halfV), 0.0), mix(8.0, 128.0, 1.0 - object.roughness.x)) * object.roughness.y;
  let ambient = skyGradient(n) * 0.55;
  let diffuse = object.color.rgb * (ambient + ndotl * 1.15);
  let col = diffuse + vec3<f32>(spec);
  return vec4<f32>(acesTonemap(col), object.color.a);
}
