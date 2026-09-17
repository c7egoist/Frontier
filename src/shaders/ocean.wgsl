#include "common.wgsl"

// ---------------------------------------------------------------------------
// Ocean surface rendering.
//
// Geometry: a camera-centred radial clipmap. Vertices live on a polar lattice
// whose radius grows geometrically, so screen-space triangle density is almost
// constant from 1 m to 20 km with a fixed, LOD-seam-free triangle budget.
// The mesh is snapped to the grid in world space to avoid swimming.
//
// Surface: the three simulation bands are tiled at their own physical sizes and
// summed, each band fading out past the distance where it is smaller than a
// pixel (analytic band LOD == free anti-aliasing and free perf).
// ---------------------------------------------------------------------------

@group(0) @binding(0) var<uniform> C : Camera;
@group(0) @binding(1) var dispTex : texture_2d_array<f32>;
@group(0) @binding(2) var linSamp : sampler;
@group(0) @binding(3) var<uniform> BL : vec4<f32>;   // band domain sizes L0,L1,L2, w = band count fade

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) world  : vec3<f32>,
  @location(1) foam   : f32,
  @location(2) flat   : vec3<f32>,  // undisplaced world pos
  @location(3) shore  : f32,
};

fn bandL(i : i32) -> f32 {
  if (i == 0) { return BL.x; }
  if (i == 1) { return BL.y; }
  return BL.z;
}

// Distance-based band weight: kill a band once its wavelength projects to less
// than ~2 px, which is exactly when it would start to alias.
fn bandWeight(i : i32, dist : f32) -> f32 {
  let L = bandL(i);
  return 1.0 - smoothstep(L * 22.0, L * 60.0, dist);
}

struct Surface {
  disp : vec3<f32>,
  foam : f32,
};

fn sampleOcean(p : vec2<f32>, dist : f32, shoal : f32) -> Surface {
  var h = 0.0;
  var d = vec2<f32>(0.0);
  var f = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let w = bandWeight(i, dist);
    if (w <= 0.001) { continue; }
    let L = bandL(i);
    let s = textureSampleLevel(dispTex, linSamp, p / L, i, 0.0);
    // Shoaling: energy conservation makes waves taller and shorter-crested as
    // depth drops (Green's law, amplitude ~ depth^-1/4), and the horizontal
    // orbital motion is suppressed by the bed.
    let g = mix(1.0, shoal, select(1.0, 0.45, i == 2));
    h += s.x * w * g;
    d += s.yz * w / max(1.0, shoal);
    f = max(f, s.w * w);
  }
  var out : Surface;
  out.disp = vec3<f32>(d.x, h, d.y) * C.params.w;
  out.foam = f;
  return out;
}

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // Decode radial clipmap coordinates from the vertex id via the index buffer's
  // implicit lattice (RES_R x RES_A supplied through BL.w packing is avoided:
  // we use a vertex-pulling formulation driven by builtins only).
  let RA : u32 = 256u;            // angular samples
  let ri = vi / (RA + 1u);
  let ai = vi % (RA + 1u);

  let t = f32(ri) / 192.0;                       // 0..1 over radial rings
  let radius = 0.6 * exp(t * 10.3);              // 0.6 m -> ~18 km, geometric
  let ang = f32(ai) / f32(RA) * 2.0 * PI;

  var p = C.eye.xz + vec2<f32>(cos(ang), sin(ang)) * radius;
  // Snap to a quantised lattice so the mesh does not swim under the camera.
  let q = max(0.25, radius * 0.02);
  p = floor(p / q + 0.5) * q;

  let dist = length(p - C.eye.xz);
  let bed = seabed(p);
  let depth = max(0.0, -bed);
  let shoal = clamp(pow(max(depth, 0.6) / 60.0, -0.25), 0.6, 2.6);

  let s = sampleOcean(p, dist, shoal);
  // Waves must vanish on dry land and taper across the swash zone.
  let wet = smoothstep(-0.2, 2.5, depth);
  let world = vec3<f32>(p.x + s.disp.x * wet, C.params.z + s.disp.y * wet, p.y + s.disp.z * wet);

  var out : VSOut;
  out.clip = C.viewProj * vec4<f32>(world, 1.0);
  out.world = world;
  out.flat = vec3<f32>(p.x, C.params.z, p.y);
  out.foam = s.foam * wet;
  out.shore = smoothstep(8.0, 0.0, depth);
  return out;
}

// --- shading -----------------------------------------------------------------

fn skyColor(dir : vec3<f32>) -> vec3<f32> {
  let sun = normalize(C.sun.xyz);
  let up = clamp(dir.y, -1.0, 1.0);
  let horizon = vec3<f32>(0.62, 0.74, 0.86);
  let zenith  = vec3<f32>(0.12, 0.30, 0.62);
  var col = mix(horizon, zenith, pow(clamp(up, 0.0, 1.0), 0.55));
  let mu = max(0.0, dot(dir, sun));
  col += vec3<f32>(1.0, 0.85, 0.62) * pow(mu, 8.0) * 0.30;
  col += vec3<f32>(1.0, 0.92, 0.78) * pow(mu, 900.0) * 14.0;
  col = mix(col, vec3<f32>(0.52, 0.60, 0.70), smoothstep(0.06, -0.05, up));
  return col;
}

fn oceanNormal(p : vec2<f32>, dist : f32, shoal : f32) -> vec3<f32> {
  let e = max(0.35, dist * 0.004);
  let hx = sampleOcean(p + vec2<f32>(e, 0.0), dist, shoal).disp.y
         - sampleOcean(p - vec2<f32>(e, 0.0), dist, shoal).disp.y;
  let hz = sampleOcean(p + vec2<f32>(0.0, e), dist, shoal).disp.y
         - sampleOcean(p - vec2<f32>(0.0, e), dist, shoal).disp.y;
  return normalize(vec3<f32>(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let eye = C.eye.xyz;
  let V = normalize(eye - in.world);
  let dist = length(eye - in.world);
  let depth = max(0.0, -seabed(in.flat.xz));
  let shoal = clamp(pow(max(depth, 0.6) / 60.0, -0.25), 0.6, 2.6);

  var N = oceanNormal(in.flat.xz, dist, shoal);
  // Flatten normals with distance to fight specular aliasing.
  N = normalize(mix(N, vec3<f32>(0.0, 1.0, 0.0), smoothstep(400.0, 6000.0, dist)));

  let L = normalize(C.sun.xyz);
  let R = reflect(-V, N);
  let sky = skyColor(R);

  // Fresnel (Schlick, F0 = 0.02 for water).
  let f = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // Subsurface / refracted colour: shallow water reads the sand, deep water is
  // dominated by absorption of long wavelengths.
  let deepCol    = vec3<f32>(0.004, 0.038, 0.072);
  let shallowCol = vec3<f32>(0.10, 0.42, 0.44);
  let sandCol    = vec3<f32>(0.66, 0.60, 0.45);
  let absorb = exp(-vec3<f32>(0.16, 0.055, 0.035) * depth);
  var refr = mix(deepCol, shallowCol, exp(-depth * 0.045));
  refr = mix(refr, sandCol * absorb, smoothstep(12.0, 0.0, depth));

  // Cheap SSS: light bleeding through the back of a lifted crest.
  let lift = clamp((in.world.y - C.params.z) * 0.55, 0.0, 1.0);
  let sss = pow(max(0.0, dot(V, -normalize(L - N * 0.9))), 3.0) * lift;
  refr += vec3<f32>(0.06, 0.30, 0.26) * sss * 1.5;

  var col = mix(refr, sky, f);

  // Sun glitter.
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), 900.0) * 3.2
           + pow(max(dot(N, H), 0.0), 60.0) * 0.18;
  col += vec3<f32>(1.0, 0.94, 0.82) * spec * smoothstep(-0.02, 0.12, L.y);

  // Foam: simulated whitecaps + a shoreline swash band.
  var foam = in.foam * C.params.y;
  let swash = in.shore * (0.35 + 0.65 * sin(in.flat.x * 0.08 + in.flat.z * 0.06 + C.eye.w * 0.9));
  foam = clamp(foam + max(0.0, swash) * in.shore, 0.0, 1.0);
  let foamTex = 0.6 + 0.4 * fbm(in.flat.xz * 0.6, 3);
  col = mix(col, vec3<f32>(0.92, 0.96, 1.0) * (0.55 + 0.45 * max(0.0, L.y)), clamp(foam * foamTex, 0.0, 1.0));

  // Distance fog into the sky.
  let fog = 1.0 - exp(-dist * 0.00016);
  col = mix(col, skyColor(normalize(in.world - eye)), fog);

  col = 1.0 - exp(-col * C.sun.w);
  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
  return vec4<f32>(col, 1.0);
}
