// Terrain pass — the SDF blockout rasterised through a CPU bake, drawn as a heightfield mesh.
//
// The mesh is a regular grid; heights come from the bake texture (rgba16float: r = height in m,
// g = coast distance / worldSize, b = land mask, a = slope). The CPU bake is the source of truth
// for both display and exports, so cities and coastlines never disagree with what is drawn.
//
// One draw per LOD: `grid` mode draws the whole world, `patch` mode draws a finer tile around the
// camera (same texture, higher tessellation and extra procedural detail).

struct TerrainParams {
  size        : u32,
  worldSize   : f32,
  centerX     : f32,
  centerZ     : f32,
  halfExtent  : f32,
  detailGain  : f32,
  seaLevel    : f32,
  gridN       : u32,
};
@group(1) @binding(0) var<uniform> tp : TerrainParams;
@group(1) @binding(1) var heightTex : texture_2d<f32>;
@group(1) @binding(2) var linearClampTex : sampler;
@group(1) @binding(3) var<storage, read> indices : array<u32>;

struct TOut {
  @builtin(position) pos : vec4f,
  @location(0) world : vec3f,
  @location(1) normal : vec3f,
  @location(2) height : f32,
  @location(3) coast : f32,
  @location(4) land : f32,
};

fn heightUv(world : vec2f) -> vec2f {
  let half = tp.worldSize * 0.5;
  return (world + vec2f(half, half)) / tp.worldSize;
}

fn sampleHeight(uv : vec2f) -> vec4f {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return vec4f(-frame.misc.z, 1.0, 0.0, 0.0);
  }
  return textureSampleLevel(heightTex, linearClampTex, uv, 0.0);
}

@vertex fn vs(@builtin(vertex_index) vi : u32) -> TOut {
  let n = i32(tp.gridN);
  let idx = indices[vi];
  let x = i32(idx % u32(n + 1));
  let z = i32(idx / u32(n + 1));
  let t = vec2f(f32(x) / f32(n), f32(z) / f32(n));
  let world = vec2f(tp.centerX - tp.halfExtent + t.x * 2.0 * tp.halfExtent,
                    tp.centerZ - tp.halfExtent + t.y * 2.0 * tp.halfExtent);
  let uv = heightUv(world);
  let s = sampleHeight(uv);
  var h = s.r;

  // Extra procedural detail only where the mesh is fine enough to carry it.
  if (tp.detailGain > 0.0) {
    let p = world / tp.worldSize;
    h = h + (simplex2(p.x * 2400.0, p.y * 2400.0) * 18.0
           + simplex2(p.x * 700.0, p.y * 700.0) * 70.0) * tp.detailGain;
  }

  // Normal from the height texture (central differences) plus the same detail slope.
  let texel = 1.0 / f32(tp.size);
  let hx0 = sampleHeight(uv + vec2f(-texel, 0.0)).r;
  let hx1 = sampleHeight(uv + vec2f(texel, 0.0)).r;
  let hz0 = sampleHeight(uv + vec2f(0.0, -texel)).r;
  let hz1 = sampleHeight(uv + vec2f(0.0, texel)).r;
  let cell = tp.worldSize / f32(tp.size);
  var nrm = normalize(vec3f(-(hx1 - hx0) / (2.0 * cell), 1.0, -(hz1 - hz0) / (2.0 * cell)));

  var out : TOut;
  out.pos = frame.viewProj * vec4f(world.x, h, world.y, 1.0);
  out.world = vec3f(world.x, h, world.y);
  out.normal = nrm;
  out.height = h;
  out.coast = s.g;
  out.land = s.b;
  return out;
}

fn terrainColor(h : f32, slope : f32, coast : f32, landMask : f32) -> vec3f {
  let sea = tp.seaLevel;
  let depth = sea - h;
  if (depth > 0.0) {
    // Seabed: fine sand near the shore, silt on the shelf, dark abyssal plain.
    let sand = vec3f(0.52, 0.47, 0.36);
    let silt = vec3f(0.24, 0.26, 0.27);
    let abyss = vec3f(0.05, 0.06, 0.08);
    let t1 = smoothstep(0.0, 220.0, depth);
    let t2 = smoothstep(150.0, 4200.0, depth);
    var c = mix(mix(sand, silt, t1), abyss, t2);
    // Seafloor ripples catch the light in the shallows.
    c = c * (0.94 + 0.06 * sin(h * 0.35));
    return c;
  }
  // Beach -> grass -> scrub -> rock -> snow, by altitude and slope.
  let beachH = 18.0;
  let grassH = 900.0;
  let rockH = 2600.0;
  let snowH = 4100.0;
  let beach = vec3f(0.74, 0.68, 0.50);
  let grass = vec3f(0.29, 0.40, 0.20);
  let scrub = vec3f(0.42, 0.42, 0.24);
  let rock = vec3f(0.36, 0.34, 0.32);
  let snow = vec3f(0.92, 0.94, 0.97);
  var c = mix(beach, grass, smoothstep(0.0, beachH, h));
  c = mix(c, scrub, smoothstep(grassH * 0.55, grassH * 1.4, h));
  c = mix(c, rock, smoothstep(rockH * 0.7, rockH * 1.25, h + slope * 900.0));
  c = mix(c, snow, smoothstep(snowH, snowH + 500.0, h - slope * 700.0));
  // Steep faces are bare rock at any altitude.
  c = mix(c, rock * 0.9, smoothstep(0.42, 0.75, slope));
  return c;
}

@fragment fn fs(in : TOut) -> @location(0) vec4f {
  let nrm = normalize(in.normal);
  let slope = 1.0 - clamp(nrm.y, 0.0, 1.0);
  var albedo = terrainColor(in.height, slope, in.coast, in.land);

  let sunDir = normalize(frame.sunDir.xyz);
  let ndl = max(dot(nrm, sunDir), 0.0);
  let ambient = mix(vec3f(0.16, 0.18, 0.22), vec3f(0.30, 0.34, 0.40), clamp(nrm.y, 0.0, 1.0));
  var col = albedo * (frame.sunColor.rgb * frame.sunDir.w * ndl + ambient);

  // Water darkening for submerged terrain (the ocean surface adds its own absorption on top).
  let depth = tp.seaLevel - in.height;
  if (depth > 0.0) {
    let absorb = exp(-depth * vec3f(0.020, 0.0068, 0.0045));
    col = col * mix(vec3f(0.20, 0.32, 0.38), vec3f(1.0), absorb);
  }

  col = applyFog(col, in.world, frame.eye.xyz, sunDir);
  return vec4f(col, 1.0);
}
