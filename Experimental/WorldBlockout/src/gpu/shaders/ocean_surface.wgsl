// Ocean surface — the adaptive water renderer.
//
// Four regimes, selected per ring by the LOD resolver (src/core/lod.ts):
//   ring 0 (inside simRadius)  : shallow-water simulation heightfield + finest spectrum chop
//   rings until flatDistance   : tessellated mesh displaced by spectrum cascades
//   rings until horizonDistance: flat geometry, normals still from the spectrum
//   horizon skirt (separate)   : shading only
//
// The adaptivity is not a fixed distance chain: each cascade fades out when its texel footprint
// drops below a pixel, so the renderer never shades detail it cannot resolve and never aliases.
// Geometry density follows the same rule through the ring table.
//
// Bindings (group 1) are per ring; group 0 holds frame constants.

struct RingData {
  origin      : vec2f,  // snapped world origin of this ring (x, z)
  spacing     : f32,    // metres per quad
  inner       : f32,    // inner extent (metres)
  outer       : f32,    // outer extent (metres)
  index       : f32,
  regime      : f32,    // 0 sim, 1 displaced, 2 flat, 3 horizon
  quads       : f32,
  amplitude   : f32,    // 0..1 displacement fade for this ring (geomorph)
  pad0        : f32,
  pad1        : f32,
  pad2        : f32,
};
@group(1) @binding(0) var<uniform> ring : RingData;
// One texture per cascade keeps sampling explicit (no texture-array layer arithmetic in the
// hot loop) and lets each cascade keep its own resolution.
@group(1) @binding(1) var fieldTex0 : texture_2d<f32>;        // cascade 0: h, sx, sz, jacobian
@group(1) @binding(2) var fieldSampler : sampler;
@group(1) @binding(3) var simTex : texture_2d<f32>;           // near-field SWE sim
@group(1) @binding(4) var bathyTex : texture_2d<f32>;         // r = terrain height, g = coast distance
@group(1) @binding(5) var bathySampler : sampler;
@group(1) @binding(6) var fieldTex1 : texture_2d<f32>;        // cascade 1 (64 m)
@group(1) @binding(7) var fieldTex2 : texture_2d<f32>;        // cascade 2 (8 m)

const CASCADE_TILES = vec3f(512.0, 64.0, 8.0);

struct OVOut {
  @builtin(position) pos : vec4f,
  @location(0) world : vec3f,
  @location(1) normal : vec3f,
  @location(2) foam : f32,
  @location(3) depth : f32,
  @location(4) screen : vec2f,
  @location(5) cascadeFade : vec3f,
  @location(6) ringIndex : f32,
};

// ---------------------------------------------------------------------------
// Depth / bathymetry
// ---------------------------------------------------------------------------
fn bathymetry(worldXZ : vec2f) -> vec2f {
  let half = tpWorldHalf();
  let uv = (worldXZ + vec2f(half, half)) / (half * 2.0);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return vec2f(-frame.cascade.w, 1.0); // outside the world: abyssal depth
  }
  let s = textureSampleLevel(bathyTex, bathySampler, uv, 0.0);
  return vec2f(s.r, s.g);
}

// Half-world extent passed from the host (worldSize / 2).
fn tpWorldHalf() -> f32 { return frame.world.y; }

// ---------------------------------------------------------------------------
// Cascade sampling
// ---------------------------------------------------------------------------
fn cascadeUv(worldXZ : vec2f, tile : f32, layer : i32) -> vec2f {
  // World-locked: the wave field is periodic with the tile, so sampling must not move with the
  // camera or the surface would swim under the viewer.
  return worldXZ / tile;
}

fn cascadeField(worldXZ : vec2f, tile : f32, layer : i32) -> vec4f {
  let uv = cascadeUv(worldXZ, tile, layer);
  if (layer == 0) { return textureSampleLevel(fieldTex0, fieldSampler, uv, 0.0); }
  if (layer == 1) { return textureSampleLevel(fieldTex1, fieldSampler, uv, 0.0); }
  return textureSampleLevel(fieldTex2, fieldSampler, uv, 0.0);
}

/**
 * Per-cascade visibility: a cascade is faded out once one of its texels projects to less than
 * about a pixel and a half. This is the water equivalent of Nanite's error metric — measured in
 * screen space, decided per fragment, applied to both displacement and shading.
 */
fn cascadeFade(worldXZ : vec2f, tile : f32, n : f32) -> f32 {
  // A cascade only covers `tile` metres before it repeats; outside its extent it contributes
  // nothing rather than tiling visibly. This is what keeps the far ocean seam-free.
  let ext = 0.5 * tile;
  let rel = abs(worldXZ - frame.eye.xz);
  let inExtent = smoothstep(ext, ext * 0.75, max(rel.x, rel.y));
  if (inExtent <= 0.0) { return 0.0; }
  let texel = tile / n;
  let dist = max(distance(vec3f(worldXZ.x, 0.0, worldXZ.y), frame.eye.xyz), 1.0);
  // World metres covered by one screen pixel at this distance (vertical FOV in frame.misc.z).
  let footprint = dist * 2.0 * tan(frame.misc.z * 0.5) / max(frame.screen.y, 1.0);
  return smoothstep(1.0, 3.0, texel / max(footprint, 1e-4)) * inExtent;
}

fn sampleDisplacement(worldXZ : vec2f, fade : vec3f) -> vec4f {
  // height, dx, dz, slopeXZ packed
  var acc = vec4f(0.0);
  for (var i = 0; i < 3; i = i + 1) {
    let f = cascadeField(worldXZ, CASCADE_TILES[i], i);
    acc.x += f.x * fade[i];
    acc.y += f.y * fade[i];
    acc.z += f.z * fade[i];
    acc.w += (f.y + f.z) * 0.0;
  }
  return acc;
}

fn spectrumSlope(worldXZ : vec2f, fade : vec3f) -> vec2f {
  var slope = vec2f(0.0);
  for (var i = 0; i < 3; i = i + 1) {
    let f = cascadeField(worldXZ, CASCADE_TILES[i], i);
    slope += f.yz * fade[i];
  }
  return slope;
}

fn spectrumFoam(worldXZ : vec2f, fade : vec3f) -> f32 {
  var foam = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let f = cascadeField(worldXZ, CASCADE_TILES[i], i);
    foam = max(foam, smoothstep(0.62, 0.0, f.w) * fade[i]);
  }
  return foam;
}

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------
// Per-triangle corner table: xy = (grid offset x, grid offset z).
const QUAD_CORNERS = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
);

@vertex fn vs(@builtin(vertex_index) idx : u32) -> OVOut {
  let q = u32(ring.quads);
  let quad = idx / 6u;
  let corner = QUAD_CORNERS[idx % 6u];
  let qx = f32(quad % q);
  let qz = f32(quad / q);
  let t = (vec2f(qx, qz) + corner) / f32(q);

  // Full-square LOD: the outer radius bounds this ring; finer rings are drawn over it and the
  // fragment stage discards anything inside a finer ring.
  let extent = ring.outer;
  let worldXZ = ring.origin + (t * 2.0 - 1.0) * extent;

  // Distance-based cascade fades, evaluated once per vertex.
  let fade = vec3f(
    cascadeFade(worldXZ, CASCADE_TILES.x, frame.world.z),
    cascadeFade(worldXZ, CASCADE_TILES.y, frame.world.z),
    cascadeFade(worldXZ, CASCADE_TILES.z, frame.world.z),
  );

  let bathy = bathymetry(worldXZ);
  let waterDepth = frame.sim.w - bathy.x;

  var normal = vec3f(0.0, 1.0, 0.0);
  var foam = 0.0;

  // Underwater only: skip water where the seabed is above the water line.
  if (waterDepth <= 0.0) {
    var out : OVOut;
    out.pos = vec4f(0.0, 0.0, -2.0, 1.0); // behind the near plane: culled
    out.world = vec3f(worldXZ.x, 0.0, worldXZ.y);
    out.normal = vec3f(0.0, 1.0, 0.0);
    out.foam = 0.0;
    out.depth = 0.0;
    out.screen = vec2f(0.0);
    out.cascadeFade = fade;
    out.ringIndex = ring.index;
    return out;
  }

  let chop = sampleDisplacement(worldXZ, fade);
  var h = chop.x * ring.amplitude;

  if (ring.regime < 0.5) {
    // Near field: shallow-water simulation on top of the spectrum.
    let half = frame.sim.x;
    let uv = (worldXZ - frame.eye.xz) / (2.0 * half) + 0.5;
    if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
      let s = textureSampleLevel(simTex, fieldSampler, uv, 0.0);
      let gate = smoothstep(0.0, 0.35, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
      h = mix(h, s.r, gate * ring.amplitude);
      foam = s.g * gate;
      normal = normalize(vec3f(-s.z, 1.0, -s.w));
    }
  } else {
    let slope = spectrumSlope(worldXZ, fade);
    normal = normalize(vec3f(-slope.x, 1.0, -slope.y));
    foam = spectrumFoam(worldXZ, fade) * ring.amplitude;
  }

  // Shallow water calms down: wave height scales with depth (Green's law-ish, clamped).
  let shoal = clamp(waterDepth / 40.0, 0.18, 1.0);
  h = h * shoal;
  normal = normalize(mix(vec3f(0.0, 1.0, 0.0), normal, clamp(shoal * 1.4, 0.15, 1.0)));

  var out : OVOut;
  out.pos = frame.viewProj * vec4f(worldXZ.x, frame.sim.w + h, worldXZ.y, 1.0);
  out.world = vec3f(worldXZ.x, frame.sim.w + h, worldXZ.y);
  out.normal = normal;
  out.foam = foam;
  out.depth = waterDepth;
  out.screen = out.pos.xy;
  out.cascadeFade = fade;
  out.ringIndex = ring.index;
  return out;
}

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------
fn ggxSpecular(N : vec3f, V : vec3f, L : vec3f, roughness : f32, f0 : f32) -> f32 {
  let H = normalize(V + L);
  let ndl = max(dot(N, L), 0.0);
  let ndh = max(dot(N, H), 1e-4);
  let ndv = max(dot(N, V), 1e-4);
  let vdh = max(dot(V, H), 0.0);
  let a = roughness * roughness;
  let a2 = a * a;
  let d = a2 / (PI * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let g = (ndl / (ndl * (1.0 - k) + k)) * (ndv / (ndv * (1.0 - k) + k));
  let f = f0 + (1.0 - f0) * pow(1.0 - vdh, 5.0);
  return (d * g * f) / max(4.0 * ndv * ndl, 1e-3) * ndl;
}

/** Distinct, readable colour per ring for the LOD overlay. */
fn ringTint(i : f32) -> vec3f {
  let palette = array<vec3f, 8>(
    vec3f(0.20, 0.55, 0.95), vec3f(0.22, 0.72, 0.80), vec3f(0.30, 0.85, 0.55),
    vec3f(0.85, 0.85, 0.30), vec3f(0.95, 0.65, 0.25), vec3f(0.95, 0.40, 0.30),
    vec3f(0.80, 0.35, 0.70), vec3f(0.55, 0.45, 0.95)
  );
  return palette[u32(clamp(i, 0.0, 7.0))];
}

@fragment fn fs(in : OVOut) -> @location(0) vec4f {
  // Discard fragments covered by a finer ring: keeps LODs from stitching over each other.
  let d = length(in.world.xz - frame.eye.xz);
  // Rings are nested squares. The finer ring covers a square of half-extent `ring.inner`, so
  // the discard must use the square (Chebyshev) distance — using radial distance would leave the
  // corners of the finer square drawn twice and double-darken them through alpha blending.
  let cheb = max(abs(in.world.x - ring.origin.x), abs(in.world.z - ring.origin.y));
  // A ring covers the full square of half-extent `outer`; the next finer ring covers the square of
  // half-extent `outer / 2`. Fragments inside that inner square belong to the finer ring.
  if (ring.index > 0.5 && cheb < ring.outer * 0.5) { discard; }

  let V = normalize(frame.eye.xyz - in.world);
  let sunDir = normalize(frame.sunDir.xyz);
  var N = normalize(in.normal);

  // Recompute the normal at fragment rate from the spectrum so shading keeps detail the
  // tessellation cannot carry (this is what makes far water read as water, not plastic).
  let fade = in.cascadeFade;
  let slope = spectrumSlope(in.world.xz, fade);
  let detailN = normalize(vec3f(-slope.x, 1.0, -slope.y));
  let detailAmount = clamp(1.0 - smoothstep(frame.misc.x * 0.5, frame.misc.x, d), 0.0, 1.0);
  N = normalize(mix(N, detailN, 0.35 * detailAmount));

  let depth = max(in.depth, 0.0);

  // --- water body colour: Beer-Lambert absorption of the seabed -----------------------------
  let absorbCoeff = vec3f(0.42, 0.10, 0.055);   // per metre, coastal water
  let scatterColor = vec3f(0.003, 0.030, 0.058);
  let lightThrough = exp(-depth * absorbCoeff);
  let seabedAlbedo = vec3f(0.30, 0.29, 0.22);
  let sunNdl = max(dot(N, sunDir), 0.0);
  let downwelling = frame.sunColor.rgb * frame.sunDir.w * (0.35 + 0.65 * sunNdl);
  var body = scatterColor * downwelling * (0.6 + 0.4 * smoothstep(0.0, 60.0, depth));
  body += seabedAlbedo * downwelling * lightThrough * exp(-depth * 0.12);

  // --- reflection ---------------------------------------------------------------------------
  let R = reflect(-V, N);
  var refl = skyColor(R, sunDir);
  refl = applyFog(refl, in.world + R * 8000.0, frame.eye.xyz, sunDir);
  let ndv = clamp(dot(N, V), 0.0, 1.0);
  let fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // Water does not reflect the sky at face value: a little is absorbed in the surface layer,
  // and at grazing angles the wave slopes roughen the mirror so the reflection dims rather than
  // blowing out to white.
  refl = refl * mix(0.62, 0.95, smoothstep(0.0, 0.35, ndv));

  // Roughness grows with distance because sub-pixel waves are unresolved.
  let rough = clamp(0.04 + 0.10 * clamp(length(slope), 0.0, 1.0) + smoothstep(200.0, 30000.0, d) * 0.25, 0.02, 0.6);
  var spec = ggxSpecular(N, V, sunDir, rough, 0.02) * frame.sunColor.rgb * frame.sunDir.w * 1.6;

  // --- subsurface glow through backlit crests ------------------------------------------------
  let H = normalize(sunDir + N * 0.35);
  let sss = pow(clamp(dot(V, -H), 0.0, 1.0), 3.0) * clamp(1.0 - N.y * 3.0, 0.0, 1.0);
  let sssCol = vec3f(0.05, 0.35, 0.30) * sss * frame.sunColor.rgb * frame.sunDir.w * 0.7;

  var col = mix(body, refl, clamp(fresnel, 0.0, 0.86)) + spec + sssCol;

  // --- foam ----------------------------------------------------------------------------------
  let shoreFoam = smoothstep(6.0, 0.4, depth) * smoothstep(0.0, 0.35, in.foam + 0.35);
  let crestFoam = smoothstep(0.35, 0.85, in.foam);
  let foamMask = clamp(shoreFoam + crestFoam, 0.0, 1.0);
  let foamCol = vec3f(0.86, 0.90, 0.93) * (frame.sunColor.rgb * frame.sunDir.w * (0.3 + 0.7 * sunNdl) + vec3f(0.18));
  col = mix(col, foamCol, foamMask * 0.85);

  // --- shoreline thinning --------------------------------------------------------------------
  let shoreAlpha = smoothstep(0.0, 0.35, depth);

  col = applyFog(col, in.world, frame.eye.xyz, sunDir);

  // LOD overlay: `lodDebug` is 1 when the host wants the adaptive structure visible.
  if (frame.debug.x > 0.5) {
    let tint = ringTint(in.ringIndex);
    col = mix(col, tint, 0.55);
  }
  return vec4f(col, mix(0.65, 1.0, shoreAlpha));
}
