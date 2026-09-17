// Fused shallow-water SPH step: one dispatch per substep, everything in the neighbour loop.
//
// Formulation (see docs/RESEARCH.md for the derivation and the literature):
//  * Each particle owns a *fixed column volume* V = dx^2 * depth, so mass is exactly conserved by
//    construction; the water depth is derived from the neighbours, h_i = sum_j V_j W_ij / (sum of the
//    lattice kernel) (the density<->height analogy of Solenthaler & Pajarola 2008 / Xia et al. 2013).
//    No continuity pass, no surface tracking, and the still-water state over a slope is a fixed point
//    because the initial volumes are the local depths. Both the height sum and the pressure gradient
//    are normalised by their lattice constants (util.wgsl), which is what makes the fixed point exact
//    rather than "almost": see docs/RESEARCH.md, "well balancing".
//  * Momentum: a_i = -g/gradNorm * (sum_j V_j grad_i W_ij - gradNorm * grad b_i). This is the
//    symmetric pressure form -sum_j m_j (p_i/rho_i^2 + p_j/rho_j^2) grad W with p = 1/2 rho g h^2;
//    the h^2 factors cancel, leaving pairwise-antisymmetric forces, i.e. exact momentum conservation
//    (unit tested).
//  * XSPH velocity smoothing (Monaghan 1989) is applied to the *advection* velocity only, so it
//    stabilises the gradient-of-density form without breaking momentum conservation.
//
// One dispatch ~ 13 neighbours * ~30 flops, plus 32 B written. That is the entire per-substep
// cost of the ocean layer.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "swe/swe_layer.wgsl"

@group(1) @binding(0) var<storage, read>       particlesIn:  array<SweParticle>;
@group(1) @binding(1) var<storage, read_write> particlesOut: array<SweParticle>;
@group(1) @binding(2) var<storage, read>       cellStart:    array<u32>;
@group(1) @binding(3) var<storage, read>       particleIndex: array<u32>;
/// Volume handed back by the 3D layer (fixed point, 1/256 m^3). Consumed and cleared here, one
/// slot per particle, so no pass needs a global barrier.
@group(1) @binding(4) var<storage, read_write> deposit: array<atomic<u32>>;
@group(1) @binding(8) var bedTex: texture_2d<f32>;
@group(1) @binding(9) var bedSampler: sampler;

const XSPH_EPS: f32 = 0.18;
const BREAKING_DRAG: f32 = 1.1;
const BED_GRAD_STEP: f32 = 1.0; // metres; also the smoothing length of the effective bed

/// Depth sampled from the baked bathymetry (bilinear, so the gradient below is smooth).
fn depthAt(xz: vec2<f32>) -> f32 {
  let uv = (xz - P.bedOrigin) * (1.0 / (2.0 * P.bedWorldHalf));
  return textureSampleLevel(bedTex, bedSampler, uv + vec2<f32>(0.5), 0.0).r;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= lCount()) { return; }
  let i = gid.x;

  let p = particlesIn[i];
  let xz = p.posH.xy;
  let v = p.velV.xy;
  // Mass cycle: water absorbed by the 3D layer comes back as extra column volume here.
  var vol = p.velV.z;
  let donated = atomicExchange(&deposit[i], 0u);
  if (donated > 0u) {
    vol = vol + f32(donated) / 256.0;
  }

  let hKernel = lH();
  let kNorm = 6.0 / (PI * hKernel * hKernel);
  let r2Max = hKernel * hKernel;
  let cell = cellCoordOf(xz);

  var hDerived = vol * kNorm;      // self term (q = 0)
  var gradHSum = vec2<f32>(0.0);   // sum_j V_j grad_i W_ij == grad of the smoothed height
  var xsph = vec2<f32>(0.0);       // sum_j (V_j/h) (v_j - v_i) W_ij
  var neighbours = 0u;
  var approaching = 0.0;           // compression metric for the whitecap / dissipation model

  let gw = i32(lGridW());
  let gh = i32(lGridH());
  let maxN = P.maxNeighbors;

  for (var gy = -1; gy <= 1; gy = gy + 1) {
    for (var gx = -1; gx <= 1; gx = gx + 1) {
      let c = u32(clamp(i32(cell.y) + gy, 0, gh - 1)) * lGridW() + u32(clamp(i32(cell.x) + gx, 0, gw - 1));
      let start = cellStart[c];
      let end = cellStart[c + 1u];
      for (var k = start; k < end; k = k + 1u) {
        if (neighbours >= maxN) { break; }
        let j = particleIndex[k];
        if (j == i) { continue; }
        let q = particlesIn[j];
        let r = xz - q.posH.xy;
        let r2 = dot(r, r);
        if (r2 >= r2Max) { continue; }
        let rl = max(sqrt(r2), 1e-4);
        neighbours = neighbours + 1u;

        let qq = rl / hKernel;
        let w = kernelWq(qq, hKernel);
        let gradFactor = kernelGradFactor(qq, hKernel);
        let dir = r / rl;                       // points away from j
        let volJ = q.velV.z;

        hDerived = hDerived + volJ * w;
        gradHSum = gradHSum + (volJ * gradFactor) * dir;
        xsph = xsph + (volJ * w) * (q.velV.xy - v);

        // Compression is what actually produces whitecaps and dissipates energy.
        approaching = approaching + max(0.0, -dot(q.velV.xy - v, dir));

        // Soft-core repulsion: the gradient-of-density form has no natural resistance to lateral
        // clumping, so add a small documented device instead of a second kernel.
        let rCore = 0.35 * hKernel;
        if (rl < rCore) {
          let push = (rCore - rl) / rCore;
          xsph = xsph + (push * push * dir) * 6.0;
        }
      }
    }
  }

  // The kernel sum over a *uniform* lattice returns ~1.12 d for a column of depth d (the discrete
  // shells do not integrate the disc exactly). Dividing by that lattice constant makes `hDerived` a
  // genuine column depth, so eta is zero in still water and the Froude/wind/drag terms see metres.
  hDerived = hDerived / latticeWSum(lDx(), hKernel);
  let hSafe = max(hDerived, 0.05);
  xsph = xsph * (XSPH_EPS / hSafe);

  // --- bathymetry -----------------------------------------------------------
  let depth = depthAt(xz);
  let step = BED_GRAD_STEP;
  let gradDepth = vec2<f32>(
    depthAt(xz + vec2<f32>(step, 0.0)) - depthAt(xz - vec2<f32>(step, 0.0)),
    depthAt(xz + vec2<f32>(0.0, step)) - depthAt(xz - vec2<f32>(0.0, step)),
  ) / (2.0 * step);
  let eta = hDerived - depth;               // surface elevation relative to still water

  // --- accelerations --------------------------------------------------------
  // grad b = -grad depth, and both terms are put in the same units: the kernel sum is a discrete
  // gradient operator whose norm on the square lattice is latticeGradNorm, so dividing it out turns
  // it into a true gradient (exact for a linear field) and makes still water a fixed point of the
  // discretisation -- no downhill creep, and the effective gravity is g rather than 0.873 g.
  let gradNorm = latticeGradNorm(lDx(), hKernel);
  var acc = -(P.gravity / gradNorm) * (gradHSum - gradNorm * gradDepth);

  // Wind stress per unit column mass: tau / (rho * h).
  acc = acc + P.windStress * P.windSpeed * P.windSpeed * P.windDir / max(hSafe, 2.0);

  // Quadratic bottom drag: makes shoaling and surf decay behave.
  let speed = length(v);
  acc = acc - (P.bottomDrag * speed / max(hSafe, 1.0)) * v;

  // Whitecap metric: Froude number gated by surface steepness.
  let fr = speed / sqrt(P.gravity * hSafe);
  let steep = length(gradHSum) / gradNorm;   // true surface steepness |grad h|
  let breaking = clamp((fr / max(P.sweBreaking, 0.05) - 0.55) * 2.0, 0.0, 1.0) * clamp(steep * 6.0, 0.0, 1.0);

  // Breaking-wave dissipation (dominant sink of a shallow-water sea state) and a weak
  // compression-proportional damping term that keeps collapsing crests from exploding.
  acc = acc - v * (BREAKING_DRAG * breaking + 0.05 * approaching);

  if (P.sweDamping > 0.0) {
    acc = acc - v * P.sweDamping;
  }

  // --- pointer interaction --------------------------------------------------
  if (P.pointerActive != 0u && !IS_COARSE) {
    let d = xz - P.pointerPos;
    let dist = length(d);
    let falloff = max(0.0, 1.0 - dist / max(P.pointerRadius, 0.1));
    let f = falloff * falloff * P.pointerForce;
    if (P.pointerMode == 1u) {
      acc = acc + f * safeNormalize2(d);
    } else if (P.pointerMode == 2u) {
      acc = acc + (f * 0.5) * (vec2<f32>(-d.y, d.x) / max(dist, 0.5));
    } else if (P.pointerMode == 3u) {
      acc = acc - (v * f) * 2.0;
    }
  }

  let accClamped = clamp(acc, vec2<f32>(-P.maxAccel), vec2<f32>(P.maxAccel));

  // --- integrate (symplectic Euler) ----------------------------------------
  let dt = P.simDt;
  var vNew = v + accClamped * dt;

  // Absorbing sponge band: damp the velocity and relax the column volume towards the local still
  // depth, so energy leaves the domain instead of reflecting off a hard wall.
  let sp = spongeFactor(xz);
  var volNew = vol;
  if (sp < 1.0) {
    let band = 1.0 - sp;
    vNew = vNew * (1.0 - 0.25 * band);
    volNew = mix(volNew, lDx() * lDx() * depth, 0.02 * band);
  }

  var xNew = xz + (vNew + xsph) * dt;

  // Toroidal wrap: an infinite ocean at a fixed particle budget. Re-localising the column volume
  // to the depth of the re-entry point exchanges a small amount of mass across the boundary, always
  // inside the absorbing band; the visible sea state is continuous.
  var wrapped = false;
  let o = lOrigin();
  let s = lSize();
  if (xNew.x < o.x) { xNew.x = xNew.x + s.x; wrapped = true; }
  if (xNew.y < o.y) { xNew.y = xNew.y + s.y; wrapped = true; }
  if (xNew.x >= o.x + s.x) { xNew.x = xNew.x - s.x; wrapped = true; }
  if (xNew.y >= o.y + s.y) { xNew.y = xNew.y - s.y; wrapped = true; }
  if (wrapped) {
    volNew = lDx() * lDx() * depthAt(xNew);
    vNew = vNew * 0.5;
  }

  particlesOut[i].posH = vec4<f32>(xNew, hDerived, breaking);
  particlesOut[i].velV = vec4<f32>(vNew, volNew, eta);
}
