// Near-field shallow-water simulation (the "2.5D water" regime, ring 0).
//
// Depth-averaged shallow water equations on a camera-centred grid:
//     dh/dt = -div(H u),   H = max(h + b, 0)      (h = surface, b = seabed)
//     du/dt = -g grad(h) - drag|u|u / H
// This is what a pure spectrum cannot do: waves refract and shoal over the seabed, wrap around
// headlands, break on beaches, and the surface carries memory of the previous frames. The
// spectrum seeds the sim at the boundary so the two regimes agree where they meet.
//
// Stability: the host clamps dt to the CFL limit for the local depth (stableSimTimestep in
// src/core/lod.ts) and substeps deeper water.
//
// State texture, ping-pong RGBA16F:  R = height (m), G = foam, B = u (m/s), A = v (m/s)

// The sim does not start from rest: it is seeded from cascade 0 and nudged back toward it, so it
// carries the same wave field as the displaced mesh while adding what a linear spectrum cannot
// represent — refraction, shoaling, breaking and wake memory.
struct SimParams {
  n          : u32,
  dt         : f32,
  cell       : f32,
  gravity    : f32,
  drag       : f32,
  damping    : f32,
  waterLevel : f32,
  tau        : f32,   // nudging time constant (s)
  originX    : f32,   // sim grid centre in world metres
  originZ    : f32,
  tile       : f32,   // cascade 0 tile, for the spectrum lookup
  pad0       : f32,
};
@group(0) @binding(0) var<uniform> sp : SimParams;
@group(0) @binding(1) var state : texture_2d<f32>;
@group(0) @binding(2) var bathymetry : texture_2d<f32>;   // r = terrain height (m)
@group(0) @binding(3) var simSampler : sampler;
@group(0) @binding(4) var nextState : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var spectrumTex : texture_2d<f32>;   // cascade 0 field: r = height

fn wr(i : i32, n : i32) -> i32 { return (i + n) % n; }

fn totalDepth(h : f32, b : f32) -> f32 { return max(h + b - sp.waterLevel, 0.0); }

fn seedHeight(x : i32, z : i32) -> f32 {
  let world = vec2f(sp.originX, sp.originZ)
    + (vec2f(f32(x), f32(z)) + 0.5) * sp.cell;
  return textureSampleLevel(spectrumTex, simSampler, world / sp.tile, 0.0).x;
}

@compute @workgroup_size(8, 8, 1)
fn step(@builtin(global_invocation_id) gid : vec3u) {
  let n = i32(sp.n);
  let x = i32(gid.x);
  let z = i32(gid.y);
  if (x >= n || z >= n) { return; }

  let here = textureLoad(state, vec2i(x, z), 0);
  let b = textureLoad(bathymetry, vec2i(x, z), 0).r;
  let h = here.x;
  let H = totalDepth(h, b);

  let xp = vec2i(wr(x + 1, n), z);
  let xm = vec2i(wr(x - 1, n), z);
  let zp = vec2i(x, wr(z + 1, n));
  let zm = vec2i(x, wr(z - 1, n));

  let hxp = textureLoad(state, xp, 0).x;
  let hxm = textureLoad(state, xm, 0).x;
  let hzp = textureLoad(state, zp, 0).x;
  let hzm = textureLoad(state, zm, 0).x;

  let u = here.z;
  let v = here.w;

  // --- momentum ------------------------------------------------------------------------------
  let dhdx = (hxp - hxm) / (2.0 * sp.cell);
  let dhdz = (hzp - hzm) / (2.0 * sp.cell);
  let speed = length(vec2f(u, v));
  let dragK = sp.drag * speed / max(H, 0.5);
  var un = u - sp.dt * (sp.gravity * dhdx + dragK * u);
  var vn = v - sp.dt * (sp.gravity * dhdz + dragK * v);

  // --- continuity: upwind face fluxes ---------------------------------------------------------
  let uxp = textureLoad(state, xp, 0).z;
  let uxm = textureLoad(state, xm, 0).z;
  let vzp = textureLoad(state, zp, 0).w;
  let vzm = textureLoad(state, zm, 0).w;

  let Hxp = totalDepth(hxp, textureLoad(bathymetry, xp, 0).r);
  let Hxm = totalDepth(hxm, textureLoad(bathymetry, xm, 0).r);
  let Hzp = totalDepth(hzp, textureLoad(bathymetry, zp, 0).r);
  let Hzm = totalDepth(hzm, textureLoad(bathymetry, zm, 0).r);

  let uFaceP = 0.5 * (u + uxp);
  let uFaceM = 0.5 * (u + uxm);
  let vFaceP = 0.5 * (v + vzp);
  let vFaceM = 0.5 * (v + vzm);

  // Upwind: take the depth from the cell the flow is coming out of.
  let HupP = select(Hxp, H, uFaceP > 0.0);
  let HupM = select(Hxm, H, uFaceM > 0.0);
  let HupZP = select(Hzp, H, vFaceP > 0.0);
  let HupZM = select(Hzm, H, vFaceM > 0.0);

  let fxP = uFaceP * HupP;
  let fxM = uFaceM * HupM;
  let fzP = vFaceP * HupZP;
  let fzM = vFaceM * HupZM;

  var hn = h - sp.dt * ((fxP - fxM) / sp.cell + (fzP - fzM) / sp.cell);

  // Spectral nudging: relax toward the reference wave field. This keeps the two regimes
  // identical in the open ocean and lets the SWE term dominate only where it has something to
  // say (shallow water, breaking, obstacles).
  let nudge = clamp(sp.dt / max(sp.tau, 0.01), 0.0, 1.0);
  hn = mix(hn, seedHeight(x, z), nudge);

  // --- damping --------------------------------------------------------------------------------
  // Gentle global damping, hard damping at the grid edge so the periodic wrap is invisible.
  let ex = abs((f32(x) / f32(n) - 0.5) * 2.0);
  let ez = abs((f32(z) / f32(n) - 0.5) * 2.0);
  let edge = max(ex, ez);
  let edgeDamp = smoothstep(0.78, 1.0, edge);
  let decay = (1.0 - sp.damping) * (1.0 - edgeDamp);
  hn = hn * decay;
  un = un * decay;
  vn = vn * decay;

  // --- breaking / foam ------------------------------------------------------------------------
  let bMax = max(max(textureLoad(bathymetry, xp, 0).r, textureLoad(bathymetry, xm, 0).r),
                 max(textureLoad(bathymetry, zp, 0).r, textureLoad(bathymetry, zm, 0).r));
  let shoalSlope = (bMax - b) / sp.cell;
  let shoaling = smoothstep(0.02, 0.35, shoalSlope);
  let breakFoam = smoothstep(0.4, 1.4, speed * shoaling + shoaling * 0.5);
  let foam = max(here.y * (1.0 - sp.dt * 0.45), breakFoam * 0.85);

  textureStore(nextState, vec2i(x, z), vec4f(hn, foam, un, vn));
}

// Seeds the sim from cascade 0 so the sim and the displacement mesh agree at their boundary.
@compute @workgroup_size(8, 8, 1)
fn seed(@builtin(global_invocation_id) gid : vec3u) {
  let n = i32(sp.n);
  let x = i32(gid.x);
  let z = i32(gid.y);
  if (x >= n || z >= n) { return; }
  textureStore(nextState, vec2i(x, z), vec4f(seedHeight(x, z), 0.0, 0.0, 0.0));
}
