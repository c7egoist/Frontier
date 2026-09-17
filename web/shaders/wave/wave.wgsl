// Far-field swell: wave particles (Yuksel, House & Keyser, SIGGRAPH 2007), no FFT anywhere.
//
// A wave particle is a *localised* radial wave packet: it carries an amplitude, a wavenumber, a
// phase and a propagation direction. Because the packet is compact (one crest + one trough inside
// its radius), the surface is the sum of bounded footprints, which means:
//   * cost is O(particles * footprint) instead of O(N log N) for FFT, and
//   * each particle can use the *depth-dependent* dispersion relation, so swell slows down,
//     steepens and refracts over shoals -- something a pure FFT ocean cannot do.
//
// Packets travel at the deep-water group velocity c_g = 1/2 sqrt(g/k) (which is why wave packets
// stay coherent), and whitecaps come from a depth-limited steepness criterion.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "common/accum.wgsl"

struct WaveParticle {
  /// world XZ position
  pos: vec2<f32>,
  /// unit propagation direction
  dir: vec2<f32>,
  /// amplitude (m)
  amp: f32,
  /// wavenumber 2*pi/wavelength
  k: f32,
  /// accumulated phase (rad)
  phase: f32,
  /// packet radius (m) == wavelength, so the packet holds one full crest/trough pair
  radius: f32,
  /// whitecap / breaking metric in [0,1]
  spill: f32,
  /// per-particle seed used when the packet wraps to the other side of the domain
  seed: f32,
};

@group(1) @binding(0) var<storage, read_write> waves:    array<WaveParticle>;
@group(1) @binding(2) var<storage, read_write> farAccum: array<atomic<u32>>;
@group(1) @binding(3) var<storage, read_write> farCount: array<atomic<u32>>;
@group(1) @binding(8) var bedTex: texture_2d<f32>;
@group(1) @binding(9) var bedSampler: sampler;

/// Zeroes both far-field accumulators (height/foam/velocity + the per-texel packet count).
@compute @workgroup_size(256)
fn clearFar(@builtin(global_invocation_id) gid: vec3<u32>) {
  let slots = accumSlots(P.farHeightRes);
  let cells = P.farHeightRes.x * P.farHeightRes.y;
  if (gid.x < slots) { atomicStore(&farAccum[gid.x], 0u); }
  if (gid.x < cells) { atomicStore(&farCount[gid.x], 0u); }
}

fn depthAt(xz: vec2<f32>) -> f32 {
  let uv = (xz - P.bedOrigin) * (1.0 / (2.0 * P.bedWorldHalf)) + vec2<f32>(0.5);
  return textureSampleLevel(bedTex, bedSampler, uv, 0.0).r;
}

/// Deep-water group velocity, reduced by the finite-depth factor (1 + 2kD/sinh(2kD)).
fn groupSpeed(k: f32, depth: f32, g: f32) -> f32 {
  let kd = clamp(k * max(depth, 0.5), 0.0, 8.0);
  let s = sinh(2.0 * kd);
  let factor = select(1.0, 0.5 * (1.0 + 2.0 * kd / s), abs(s) > 1e-4);
  return sqrt(g / k) * clamp(factor, 0.35, 1.0) * P.waveSpeedScale;
}

fn phaseSpeed(k: f32, depth: f32, g: f32) -> f32 {
  let kd = clamp(k * max(depth, 0.5), 0.0, 8.0);
  return sqrt(g / k * max(tanh(kd), 0.02)) * P.waveSpeedScale;
}

// ---------------------------------------------------------------------------
// update: advance phases and positions, wrap the camera-following domain
// ---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.waveCount) { return; }
  var w = waves[gid.x];
  let dt = P.simDt;
  let depth = depthAt(w.pos);

  w.phase = w.phase + phaseSpeed(w.k, depth, P.gravity) * w.k * dt;

  // Shoaling: a shoaling packet steepens (Green's law) and starts to spill.
  let kd = clamp(w.k * max(depth, 0.5), 0.0, 8.0);
  let shallowGain = clamp(1.0 / max(tanh(kd), 0.06), 1.0, 2.2);
  let steepness = w.amp * w.k * shallowGain;
  w.spill = clamp((steepness - P.waveSteepness) * 6.0, 0.0, 1.0);

  // Group velocity advection + a slow drift with the wind (Stokes-like surface drift).
  let cg = groupSpeed(w.k, depth, P.gravity);
  let drift = P.windSpeed * 0.012 * P.windDir;
  w.pos = w.pos + (w.dir * cg + drift) * dt;

  // Camera-following toroidal wrap: leaving the packet domain re-randomises the packet, which
  // keeps the far field statistically stationary without any bookkeeping.
  let half = P.waveDomain;
  let centre = P.farHeightOrigin + 0.5 * P.farHeightSize;
  let rel = w.pos - centre;
  var wrapped = false;
  var np = rel;
  if (np.x < -half) { np.x = np.x + 2.0 * half; wrapped = true; }
  if (np.x > half) { np.x = np.x - 2.0 * half; wrapped = true; }
  if (np.y < -half) { np.y = np.y + 2.0 * half; wrapped = true; }
  if (np.y > half) { np.y = np.y - 2.0 * half; wrapped = true; }
  w.pos = centre + np;
  if (wrapped) {
    var s = u32(w.seed * 65535.0) ^ (P.frame * 2654435761u);
    s = s * 1664525u + 1013904223u;
    w.seed = f32(s >> 8u) * (1.0 / 16777216.0);
    w.phase = w.seed * TWO_PI;
  }

  waves[gid.x] = w;
}

// ---------------------------------------------------------------------------
// splat: add every packet's footprint into the far height/foam/velocity accumulators
// ---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn splat(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.waveCount) { return; }
  let w = waves[gid.x];
  let dims = vec2<i32>(P.farHeightRes);
  let texelWidth = P.farHeightSize.x / f32(dims.x);
  let origin = P.farHeightOrigin;

  let c = (w.pos - origin) / texelWorld;
  let rTexels = w.radius / texelWidth;
  let lo = vec2<i32>(floor(c - vec2<f32>(rTexels))) - vec2<i32>(1);
  let hi = vec2<i32>(ceil(c + vec2<f32>(rTexels))) + vec2<i32>(1);

  let amp = w.amp;
  let k = w.k;
  let phase = w.phase;
  let radius = max(w.radius, 0.5);
  let foam = w.spill * 0.8;
  let cg = groupSpeed(k, depthAt(w.pos), P.gravity);
  let v = w.dir * cg;

  for (var y = lo.y; y <= hi.y; y = y + 1) {
    if (y < 0 || y >= dims.y) { continue; }
    for (var x = lo.x; x <= hi.x; x = x + 1) {
      if (x < 0 || x >= dims.x) { continue; }
      let world = texelWorld(vec2<i32>(x, y), P.farHeightRes, origin, P.farHeightSize);
      let r = length(world - w.pos);
      if (r > radius) { continue; }
      let q = r / radius;
      let window = (1.0 - q * q) * (1.0 - q * q);       // quartic window, C1, compact
      let eta = amp * window * cos(k * r - phase);
      let cell = vec2<i32>(x, y);
      let base = accumBase(cell, P.farHeightRes);
      atomicAdd(&farAccum[base], u32(clamp((eta + HEIGHT_BIAS) * HEIGHT_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farAccum[base + 1u], u32(clamp(foam * FOAM_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farAccum[base + 2u], u32(clamp((v.x + VEL_BIAS) * VEL_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farAccum[base + 3u], u32(clamp((v.y + VEL_BIAS) * VEL_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farCount[u32(y) * P.farHeightRes.x + u32(x)], u32(COUNT_SCALE));
    }
  }
}
