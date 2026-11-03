// Map / plan view. The blockout is authored top-down, so the editor needs an authoritative
// colour-coded map: land cover by elevation, bathymetry by depth, coastline stroke, city plots,
// and the water LOD ring boundaries so the adaptivity is visible and debuggable.
//
// Drawn as a fullscreen quad with world-space mapping so it can be zoomed and panned.
struct MapParams {
  center      : vec2f,  // world centre of the view (x, z), metres
  viewHalf    : f32,    // metres from centre to edge
  worldHalf   : f32,
  showRings   : u32,
  showCities  : u32,
  showCoast   : u32,
  simRadius   : f32,
};
@group(1) @binding(0) var<uniform> mp : MapParams;
@group(1) @binding(1) var heightTex : texture_2d<f32>;
@group(1) @binding(2) var mapSampler : sampler;
@group(1) @binding(3) var cityBuffer : array<vec4f, 32>;  // xy = x,z ; z = radius ; w = kind

struct MOut {
  @builtin(position) pos : vec4f,
  @location(0) world : vec2f,
};

@vertex fn vs(@builtin(vertex_index) idx : u32) -> MOut {
  var p = vec2f(-1.0, -1.0);
  if (idx == 1u) { p = vec2f(3.0, -1.0); }
  if (idx == 2u) { p = vec2f(-1.0, 3.0); }
  var out : MOut;
  out.pos = vec4f(p, 0.0, 1.0);
  // uv spans the visible view; convert to world XZ
  let uv = p * 0.5 + 0.5;
  out.world = mp.center + (vec2f(uv.x, 1.0 - uv.y) * 2.0 - 1.0) * mp.viewHalf;
  return out;
}

fn bathymetryColor(depth : f32) -> vec3f {
  // Shallow turquoise to abyssal blue.
  let shallow = vec3f(0.24, 0.62, 0.66);
  let mid = vec3f(0.10, 0.28, 0.48);
  let deep = vec3f(0.03, 0.09, 0.22);
  let t1 = smoothstep(0.0, 300.0, depth);
  let t2 = smoothstep(200.0, 4200.0, depth);
  return mix(mix(shallow, mid, t1), deep, t2);
}

fn landColor(h : f32, coast : f32) -> vec3f {
  let beach = vec3f(0.80, 0.74, 0.52);
  let low = vec3f(0.36, 0.49, 0.27);
  let mid = vec3f(0.52, 0.52, 0.32);
  let high = vec3f(0.56, 0.50, 0.44);
  let peak = vec3f(0.94, 0.95, 0.98);
  var c = mix(beach, low, smoothstep(0.0, 40.0, h));
  c = mix(c, mid, smoothstep(600.0, 1600.0, h));
  c = mix(c, high, smoothstep(2200.0, 3200.0, h));
  c = mix(c, peak, smoothstep(4200.0, 4800.0, h));
  return c;
}

@fragment fn fs(in : MOut) -> @location(0) vec4f {
  let uv = (in.world + vec2f(mp.worldHalf, mp.worldHalf)) / (mp.worldHalf * 2.0);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return vec4f(0.06, 0.07, 0.09, 1.0);
  }
  let s = textureSampleLevel(heightTex, mapSampler, uv, 0.0);
  let h = s.r;
  let coast = s.g * mp.worldHalf * 2.0;

  var col : vec3f;
  if (h < 0.0) {
    col = bathymetryColor(-h);
  } else {
    col = landColor(h, coast);
  }

  // Hillshade for readability: sample neighbours in texture space.
  let texel = 1.0 / 1024.0;
  let hx = textureSampleLevel(heightTex, mapSampler, uv + vec2f(texel, 0.0), 0.0).r;
  let hz = textureSampleLevel(heightTex, mapSampler, uv + vec2f(0.0, texel), 0.0).r;
  let shade = clamp(1.0 + ((h - hx) + (h - hz)) * 0.0016, 0.55, 1.45);
  col = col * shade;

  // Coastline stroke: distance to sea level in metres, converted to a screen-constant width.
  if (mp.showCoast == 1u) {
    let pxWorld = mp.viewHalf * 2.0 / max(frame.screen.y, 1.0);
    let w = pxWorld * 1.1;
    if (abs(coast) < w) {
      col = mix(col, vec3f(0.97, 0.95, 0.86), 0.85);
    }
  }

  // Water LOD rings: circle where the sim ends, then each clipmap boundary.
  if (mp.showRings == 1u) {
    let d = length(in.world - frame.eye.xz);
    let pxWorld = mp.viewHalf * 2.0 / max(frame.screen.y, 1.0);
    let band = pxWorld * 1.4;
    if (abs(d - mp.simRadius) < band) {
      col = mix(col, vec3f(1.0, 0.42, 0.20), 0.9);
    }
    // clipmap boundaries are powers-of-two multiples of the base spacing * 32
    let r0 = 32.0 * 4.0;
    var r = r0;
    for (var i = 0; i < 10; i = i + 1) {
      if (r > mp.simRadius * 0.5 && abs(d - r) < band) {
        col = mix(col, vec3f(0.95, 0.75, 0.25) * 0.7, 0.55);
      }
      r = r * 2.0;
    }
  }

  // City plots: disc with a rim, sized by kind.
  if (mp.showCities == 1u) {
    for (var i = 0; i < 32; i = i + 1) {
      let c = cityBuffer[i];
      if (c.z <= 0.0) { continue; }
      let d = length(in.world - c.xy);
      let pxWorld = mp.viewHalf * 2.0 / max(frame.screen.y, 1.0);
      let rad = max(c.z, pxWorld * 6.0);
      if (d < rad) {
        let rim = smoothstep(rad - pxWorld * 2.0, rad, d);
        let kindCol = select(vec3f(0.95, 0.80, 0.35), vec3f(0.95, 0.45, 0.35), c.w > 0.5);
        col = mix(col, kindCol, 0.55 + 0.35 * rim);
      }
    }
  }

  return vec4f(col, 1.0);
}
