// City plots in the 3D view: flat footprint discs draped over the terrain plus a vertical marker
// so plots read at any scale from orbit to ground.
// Instance buffer: xy = world x,z ; z = radius ; w = kind (0 city, 1 port, 2 capital)
struct CityOut {
  @builtin(position) pos : vec4f,
  @location(0) alpha : f32,
  @location(1) kind : f32,
  @location(2) local : vec2f,
};

@group(1) @binding(0) var<storage, read> cities : array<vec4f>;
@group(1) @binding(1) var heightTex : texture_2d<f32>;
@group(1) @binding(2) var citySampler : sampler;
@group(1) @binding(3) var<uniform> cityInfo : vec4f; // x = count, y = worldSize, z = half

fn terrainHeight(worldXZ : vec2f) -> f32 {
  let uv = (worldXZ + vec2f(cityInfo.z, cityInfo.z)) / cityInfo.y;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return 0.0; }
  return textureSampleLevel(heightTex, citySampler, uv, 0.0).r;
}

// Per-triangle corner table: xy = (radius factor, angle offset).
const CORNERS = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
);

@vertex fn vs(@builtin(vertex_index) idx : u32, @builtin(instance_index) inst : u32) -> CityOut {
  let c = cities[inst];
  let seg = idx / 6u;
  let corner = CORNERS[idx % 6u];
  let ang = (f32(seg) + corner.y) / 32.0 * 6.28318530718;
  let rad = corner.x;
  let dir = vec2f(cos(ang), sin(ang));
  let world = c.xy + dir * c.z * rad;
  let h = terrainHeight(world);

  // Lift slightly above the terrain to avoid z-fighting with the baked surface.
  let lift = max(6.0, c.z * 0.0015);

  var out : CityOut;
  out.pos = frame.viewProj * vec4f(world.x, h + lift, world.y, 1.0);
  out.alpha = select(0.22, 0.62, rad > 0.5);
  out.kind = c.w;
  out.local = dir * rad;
  return out;
}

@fragment fn fs(in : CityOut) -> @location(0) vec4f {
  let baseCol = select(vec3f(0.98, 0.83, 0.38), vec3f(1.0, 0.52, 0.36), in.kind > 0.5);
  let edge = smoothstep(0.86, 1.0, length(in.local));
  let col = mix(baseCol * 0.75, baseCol, edge);
  return vec4f(col, in.alpha * (0.35 + 0.65 * edge));
}
