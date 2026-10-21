// Instanced camera-facing sphere-impostor particle renderer. Each instance
// is a quad expanded in the camera's right/up plane; the fragment shader
// ray-casts an analytic sphere so lighting, silhouette and depth are all
// pixel-accurate (not just a flat dot sprite).

struct RenderParticle {
  position : vec4<f32>,
  velocity : vec4<f32>,
  props    : vec4<f32>, // x materialType, y age, z contact, w unused
  accel    : vec4<f32>,
};

struct RenderMaterial {
  a : vec4<f32>, // restDensity, stiffness, viscosity, cohesion
  b : vec4<f32>, // adhesion, friction, releaseThreshold, particleRadius
  c : vec4<f32>, // colorR, colorG, colorB, damping
  d : vec4<f32>, // opacity, unused, unused, unused
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var<storage, read> particles : array<RenderParticle>;
@group(1) @binding(1) var<storage, read> materials : array<RenderMaterial>;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) color : vec3<f32>,
  @location(2) roughness : f32,
  @location(3) contact : f32,
  @location(4) speed : f32,
  @location(5) worldCenter : vec3<f32>,
  @location(6) radius : f32,
  @location(7) opacity : f32,
};

const QUAD_UV = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32, @builtin(instance_index) iIdx: u32) -> VsOut {
  var out: VsOut;
  let p = particles[iIdx];
  let mat = materials[u32(p.props.x)];
  let radius = mat.b.w;
  let uv = QUAD_UV[vIdx % 6u];

  let worldCenter = p.position.xyz;
  let worldCorner = worldCenter + camera.cameraRight.xyz * uv.x * radius * 1.35 + camera.cameraUp.xyz * uv.y * radius * 1.35;

  out.clip = camera.viewProj * vec4<f32>(worldCorner, 1.0);
  out.uv = uv;
  out.color = mat.c.rgb;
  out.roughness = mat.c.w;
  out.contact = p.props.z;
  out.speed = length(p.velocity.xyz);
  out.worldCenter = worldCenter;
  out.radius = radius;
  out.opacity = mat.d.x;
  return out;
}

struct FsOut {
  @builtin(frag_depth) depth : f32,
  @location(0) color : vec4<f32>,
};

@fragment
fn fs_main(in: VsOut) -> FsOut {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) {
    discard;
  }
  let z = sqrt(1.0 - r2);
  let normal = normalize(camera.cameraRight.xyz * in.uv.x + camera.cameraUp.xyz * in.uv.y - camera.cameraForward.xyz * z);

  // Reconstruct the true analytic sphere-surface position (not just the
  // interpolated billboard quad) so depth is pixel-accurate and particles
  // occlude / are occluded by scene geometry and each other correctly.
  let surfacePos = in.worldCenter + normal * in.radius;
  let reprojected = camera.viewProj * vec4<f32>(surfacePos, 1.0);
  let trueDepth = reprojected.z / reprojected.w;

  let lightDir = normalize(camera.lightDir.xyz);
  let viewDir = normalize(camera.cameraPos.xyz - surfacePos);
  let ndotl = max(dot(normal, lightDir), 0.0);
  let ndotv = max(dot(normal, viewDir), 0.0);
  let halfV = normalize(lightDir + viewDir);
  let shininess = mix(96.0, 8.0, in.roughness);
  let spec = pow(max(dot(normal, halfV), 0.0), shininess);
  let fres = fresnelSchlick(ndotv, 0.04);

  let ambient = skyGradient(normal) * 0.6;
  let wet = mix(1.0, 1.35, in.contact);
  let base = in.color * (ambient + ndotl * 1.2) * wet;
  let specStrength = mix(0.15, 0.85, 1.0 - in.roughness) + in.contact * 0.2;
  var col = base + vec3<f32>(spec) * specStrength + skyGradient(reflect(-viewDir, normal)) * fres * 0.5;

  let speedTint = clamp(in.speed * 0.015, 0.0, 0.12);
  col = col + vec3<f32>(speedTint * 0.3, speedTint * 0.3, speedTint * 0.5);

  let edgeFade = 1.0 - smoothstep(0.7, 1.0, r2);
  let alpha = clamp(in.opacity * edgeFade, 0.0, 1.0);

  var out: FsOut;
  out.color = vec4<f32>(acesTonemap(col), alpha);
  out.depth = clamp(trueDepth, 0.0, 1.0);
  return out;
}
