// Near-field MLS/APIC material point method: the layer that splashes.
//
// Why MPM here: no neighbour search at all (the grid *is* the acceleration structure), free
// surfaces with no tracking, and it represents overturning crests and trailing sheets that a
// height field cannot. It deliberately covers only a thin band around the camera -- the bulk of
// the ocean stays a 2D particle layer, which is what keeps the cost bounded (docs/ARCHITECTURE.md).
//
// Implementation notes
//  * Linear B-spline transfer (2 nodes per axis = 8 nodes/particle): 3.4x fewer atomics than the
//    usual quadratic kernel. The affine/APIC term is what makes a linear kernel accurate enough;
//    C is stored per particle and rebuilt every G2P (Jiang et al. 2015 show linear+APIC removes
//    the cell-crossing artefacts of plain PIC).
//  * P2G scatters mass and momentum into u32 atomics in fixed point (WebGPU has no atomic<f32>).
//    Integer adds commute, so grid accumulation is deterministic.
//  * Particle state is updated in place: no pass reads another particle's state, so a single
//    buffer suffices -- the grid carries all communication.
//  * The EOS is deliberately soft (see docs/PERFORMANCE.md for the CFL arithmetic): the near-field
//    layer is only a few metres deep, so the hydrostatic compression error stays in the few-percent
//    range while the timestep stays at 2-3 substeps per frame. Incompressibility of the *bulk* is
//    carried by the 2D shallow-water layer, which is where it matters.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"

struct MpmParticle {
  /// xyz position (m); w = 1 when the slot is alive
  pos: vec4<f32>,
  /// xyz velocity (m/s); w = det(F)
  vel: vec4<f32>,
  /// affine velocity matrix C (APIC), rebuilt every step
  C: mat3x3<f32>,
  /// deformation gradient F
  F: mat3x3<f32>,
};

// aux[]: 0 = spawn queue head, 1 = spawn queue tail, 2 = absorbed count, 3 = max speed * 8,
//        4 = spawned count, 8.. = spawn queue entries (x, z, vx, vz)
const AUX_HEAD: u32 = 0u;
const AUX_TAIL: u32 = 1u;
const AUX_ABSORBED: u32 = 2u;
const AUX_SPEED: u32 = 3u;
const AUX_SPAWNED: u32 = 4u;
const AUX_QUEUE: u32 = 8u;
const QUEUE_ENTRIES: u32 = 4096u;
const QUEUE_MASK: u32 = 4095u;

@group(1) @binding(0) var<storage, read_write> particles: array<MpmParticle>;
@group(1) @binding(1) var<storage, read_write> gridP:    array<vec2<u32>>;
@group(1) @binding(2) var<storage, read_write> gridV:    array<vec4<f32>>;
@group(1) @binding(3) var<storage, read_write> aux:      array<atomic<u32>>;
@group(1) @binding(4) var<storage, read_write> deposit:  array<atomic<u32>>;
@group(1) @binding(5) var<storage, read>       sweCell:  array<u32>;
@group(1) @binding(6) var<storage, read>       sweIndex: array<u32>;
@group(1) @binding(8) var bedTex: texture_2d<f32>;
@group(1) @binding(9) var bedSampler: sampler;
@group(1) @binding(10) var nearHeightTex: texture_2d<f32>;

// --- fixed point packing ---------------------------------------------------
const MASS_SCALE: f32 = 16.0;      // u16 -> up to 4095 kg per node, 62 g resolution
const MOM_BIAS: f32 = 32768.0;     // kg m/s, gives +-32767
const DEPOSIT_SCALE: f32 = 256.0;
const QUEUE_POS_SCALE: f32 = 32.0; // +-2048 m around the camera
const QUEUE_VEL_SCALE: f32 = 32.0; // +-2048 m/s
const QUEUE_BIAS: f32 = 65536.0;

fn packHiLo(a: f32, b: f32, scaleA: f32, scaleB: f32) -> u32 {
  return (u32(clamp(a * scaleA, 0.0, 65535.0)) << 16u) | u32(clamp(b * scaleB, 0.0, 65535.0));
}

fn unpackHi(p: u32, scale: f32) -> f32 { return f32(p >> 16u) / scale; }
fn unpackLo(p: u32, scale: f32) -> f32 { return f32(p & 0xffffu) / scale; }

// --- domain helpers --------------------------------------------------------
fn gridDim() -> vec3<i32> { return vec3<i32>(P.mpmGrid); }

fn nodeWorld(n: vec3<i32>) -> vec3<f32> { return P.mpmOrigin + vec3<f32>(n) * P.mpmDx; }

fn nodeIndex(n: vec3<i32>) -> u32 {
  let d = gridDim();
  return u32((n.z * d.y + n.y) * d.x + n.x);
}

fn insideGrid(n: vec3<i32>) -> bool {
  let d = gridDim();
  return all(n >= vec3<i32>(0)) && all(n < d);
}

fn seaSurfaceAt(xz: vec2<f32>) -> f32 {
  let uv = (xz - P.nearHeightOrigin) / P.nearHeightSize;
  return P.seaLevel + textureSampleLevel(nearHeightTex, bedSampler, uv, 0.0).r;
}

fn seaVelocityAt(xz: vec2<f32>) -> vec2<f32> {
  let uv = (xz - P.nearHeightOrigin) / P.nearHeightSize;
  return textureSampleLevel(nearHeightTex, bedSampler, uv, 0.0).ba;
}

fn bedElevationAt(xz: vec2<f32>) -> f32 {
  let uv = (xz - P.bedOrigin) / (2.0 * P.bedWorldHalf) + vec2<f32>(0.5);
  return P.seaLevel - textureSampleLevel(bedTex, bedSampler, uv, 0.0).r;
}

/// Tait equation of state on the deformation determinant: p = k ((1/J)^gamma - 1), clamped to
/// zero in tension. That clamp is what produces a free surface without any surface tracking.
fn pressureOf(J: f32) -> f32 {
  let ratio = clamp(1.0 / max(J, 0.35), 0.2, 4.0);
  return max(0.0, P.mpmStiffness * (pow(ratio, P.mpmGamma) - 1.0));
}

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) gid: vec3<u32>) {
  let d = gridDim();
  let total = u32(d.x * d.y * d.z);
  if (gid.x >= total) { return; }
  gridP[gid.x] = vec2<u32>(0u, 0u);
  gridV[gid.x] = vec4<f32>(0.0);
  if (gid.x == 0u) {
    atomicStore(&aux[AUX_ABSORBED], 0u);
    atomicStore(&aux[AUX_SPEED], 0u);
    atomicStore(&aux[AUX_SPAWNED], 0u);
  }
}

// ---------------------------------------------------------------------------
// p2g
// ---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn p2g(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.mpmMaxParticles) { return; }
  let p = particles[gid.x];
  if (p.pos.w < 0.5) { return; }
  if (p.pos.x != p.pos.x || p.pos.y != p.pos.y || p.pos.z != p.pos.z) {
    particles[gid.x].pos.w = 0.0; // NaN guard: retire corrupted slots
    return;
  }

  let x = p.pos.xyz;
  let base = vec3<i32>(floor((x - P.mpmOrigin) / P.mpmDx));
  let f = (x - P.mpmOrigin) / P.mpmDx - vec3<f32>(base);
  let v = p.vel.xyz;
  let m = P.mpmMass;
  let cellVolume = P.mpmDx * P.mpmDx * P.mpmDx;
  let pressure = pressureOf(p.vel.w);
  let invDx = 1.0 / P.mpmDx;

  for (var k = 0; k < 2; k = k + 1) {
    for (var j = 0; j < 2; j = j + 1) {
      for (var i = 0; i < 2; i = i + 1) {
        let node = base + vec3<i32>(i, j, k);
        if (!insideGrid(node)) { continue; }
        let wi = select(1.0 - f.x, f.x, i == 1);
        let wj = select(1.0 - f.y, f.y, j == 1);
        let wk = select(1.0 - f.z, f.z, k == 1);
        let w = wi * wj * wk;
        if (w <= 0.0) { continue; }

        // Exact trilinear gradient. (The MLS-MPM "gradient == displacement" identity only holds
        // for the quadratic spline, so with a linear kernel the gradient is written out.)
        let sx = select(-invDx, invDx, i == 1);
        let sy = select(-invDx, invDx, j == 1);
        let sz = select(-invDx, invDx, k == 1);
        let gw = vec3<f32>(sx * wj * wk, wi * sy * wk, wi * wj * sz);

        let d = nodeWorld(node) - x;
        let momentum = m * (v + p.C * d) * w;
        // Pressure impulse: -V grad p over dt  ->  +dt V p grad W (pressure pushes outward).
        let impulse = P.simDt * cellVolume * pressure * gw;

        let idx = nodeIndex(node);
        atomicAdd(&gridP[idx].x, packHiLo(m * w, momentum.x + impulse.x + MOM_BIAS, MASS_SCALE, 1.0));
        atomicAdd(&gridP[idx].y, packHiLo(momentum.y + impulse.y + MOM_BIAS, momentum.z + impulse.z + MOM_BIAS, 1.0, 1.0));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gridUpdate
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn gridUpdate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let d = gridDim();
  let total = u32(d.x * d.y * d.z);
  if (gid.x >= total) { return; }

  let nz = i32(gid.x / u32(d.x * d.y));
  let rem = gid.x % u32(d.x * d.y);
  let node = vec3<i32>(i32(rem % u32(d.x)), i32(rem / u32(d.x)), nz);

  let packed = gridP[gid.x];
  let mass = unpackHi(packed.x, MASS_SCALE);
  let world = nodeWorld(node);

  // Free-surface boundary: near-empty nodes are frozen, which stops stray particles from being
  // flung around by a node that almost no water touches.
  let threshold = 0.03 * P.mpmDx * P.mpmDx * P.mpmDx * P.mpmRestDensity;
  if (mass <= threshold) {
    gridV[gid.x] = vec4<f32>(0.0);
    gridP[gid.x] = vec2<u32>(0u, 0u);
    return;
  }

  let invM = 1.0 / mass;
  var velocity = vec3<f32>(
    unpackLo(packed.x, 1.0) - MOM_BIAS,
    unpackHi(packed.y, 1.0) - MOM_BIAS,
    unpackLo(packed.y, 1.0) - MOM_BIAS,
  ) * invM;

  velocity.y = velocity.y - P.gravity * P.simDt;

  if (world.y < bedElevationAt(world.xz)) {
    velocity = vec3<f32>(0.0);                        // inside the seabed: no-slip
  }
  // The box floor is an inflow boundary driven by the shallow-water layer: the 2D orbital
  // velocity is what pushes the near-field water around.
  let surface = seaSurfaceAt(world.xz);
  if (world.y < P.mpmOrigin.y + 0.25 * P.mpmDepth) {
    let v2 = seaVelocityAt(world.xz);
    velocity.xz = mix(velocity.xz, v2, 0.4);
  }
  if (world.y > surface + 0.8 * P.mpmDepth) {
    velocity.y = min(velocity.y, 0.0);
  }
  let speed = length(velocity);
  if (speed > 80.0) { velocity = velocity * (80.0 / speed); }

  gridV[gid.x] = vec4<f32>(velocity, 1.0);
  gridP[gid.x] = vec2<u32>(0u, 0u);
}

// ---------------------------------------------------------------------------
// g2p
// ---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.mpmMaxParticles) { return; }
  var p = particles[gid.x];
  if (p.pos.w < 0.5) { return; }

  let x = p.pos.xyz;
  let base = vec3<i32>(floor((x - P.mpmOrigin) / P.mpmDx));
  let f = (x - P.mpmOrigin) / P.mpmDx - vec3<f32>(base);

  var vPic = vec3<f32>(0.0);
  var cAffine = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  var weightSum = 0.0;

  for (var k = 0; k < 2; k = k + 1) {
    for (var j = 0; j < 2; j = j + 1) {
      for (var i = 0; i < 2; i = i + 1) {
        let node = base + vec3<i32>(i, j, k);
        if (!insideGrid(node)) { continue; }
        let wi = select(1.0 - f.x, f.x, i == 1);
        let wj = select(1.0 - f.y, f.y, j == 1);
        let wk = select(1.0 - f.z, f.z, k == 1);
        let w = wi * wj * wk;
        let gv = gridV[nodeIndex(node)].xyz;
        let d = nodeWorld(node) - x;
        vPic = vPic + gv * w;
        cAffine = cAffine + outerProduct(gv, d) * w;
        weightSum = weightSum + w;
      }
    }
  }

  let invW = select(1.0, 1.0 / weightSum, weightSum > 1e-5);
  vPic = vPic * invW;
  // APIC affine velocity for the linear kernel: C = (4/dx^2) sum_i w_i v_i (x_i - x_p)^T
  cAffine = cAffine * (4.0 * invW / (P.mpmDx * P.mpmDx));

  // F <- (I + dt C) F
  let id = mat3x3<f32>(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0));
  var F = (id + cAffine * P.simDt) * p.F;

  var vel = vPic;
  var xNew = x + vel * P.simDt;

  let bedY = bedElevationAt(xNew.xz) + P.mpmParticleRadius * 0.6;
  if (xNew.y < bedY) {
    xNew.y = bedY;
    vel.y = max(vel.y, 0.0);
    vel.xz = vel.xz * (1.0 - clamp(P.mpmFriction, 0.0, 1.0) * 0.5);
    F = id;
  }

  let speed = length(vel);
  atomicMax(&aux[AUX_SPEED], u32(clamp(speed * 8.0, 0.0, 4.0e9)));

  // --- mass cycle: hand volume back to the 2D layer when the water sinks below it ------------
  let surface = seaSurfaceAt(xNew.xz);
  if (xNew.y < surface - P.mpmAbsorbDepth) {
    let c = clamp(
      vec2<i32>(floor((xNew.xz - P.sweOrigin) / P.sweCellSize)),
      vec2<i32>(0),
      vec2<i32>(P.sweGridW - 1u, P.sweGridH - 1u),
    );
    let cell = u32(c.y) * P.sweGridW + u32(c.x);
    let start = sweCell[cell];
    let end = sweCell[cell + 1u];
    if (end > start) {
      let owner = sweIndex[start];
      atomicAdd(&deposit[owner], u32(clamp(P.mpmMass * DEPOSIT_SCALE / P.mpmRestDensity, 0.0, 4.0e9)));
    }
    atomicAdd(&aux[AUX_ABSORBED], 1u);
    p.pos.w = 0.0;
    particles[gid.x] = p;
    return;
  }

  p.pos = vec4<f32>(xNew, 1.0);
  p.vel = vec4<f32>(vel, clamp(det(F), 0.4, 1.6));
  p.C = cAffine;
  p.F = F;
  particles[gid.x] = p;
}

// ---------------------------------------------------------------------------
// spawn: refill dead slots from the shallow-water spawn queue (breaking crests)
// ---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn spawn(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.mpmMaxParticles) { return; }
  var p = particles[gid.x];
  if (p.pos.w >= 0.5) { return; }

  let head = atomicLoad(&aux[AUX_HEAD]);
  let tail = atomicAdd(&aux[AUX_TAIL], 1u);
  if (tail >= head || head - tail > QUEUE_ENTRIES) { return; }

  let slot = AUX_QUEUE + (tail & QUEUE_MASK) * 4u;
  // Queued positions are relative to the camera (the box follows the camera).
  let xz = P.cameraPos.xz + vec2<f32>(
    f32(atomicLoad(&aux[slot])) / QUEUE_POS_SCALE - QUEUE_BIAS,
    f32(atomicLoad(&aux[slot + 1u])) / QUEUE_POS_SCALE - QUEUE_BIAS,
  );
  let v = vec2<f32>(
    f32(atomicLoad(&aux[slot + 2u])) / QUEUE_VEL_SCALE - QUEUE_BIAS,
    f32(atomicLoad(&aux[slot + 3u])) / QUEUE_VEL_SCALE - QUEUE_BIAS,
  );

  let surface = seaSurfaceAt(xz);
  var seed = P.seed ^ (gid.x * 747796405u) ^ (P.frame * 2246822519u);
  let jitter = (rand2(&seed) - vec2<f32>(0.5)) * P.mpmDx;
  let id = mat3x3<f32>(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0));

  p.pos = vec4<f32>(xz.x + jitter.x, surface + P.mpmDx * 0.5, xz.y + jitter.y, 1.0);
  p.vel = vec4<f32>(v.x, 0.5, v.y, 1.0);
  p.C = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  p.F = id;
  particles[gid.x] = p;
  atomicAdd(&aux[AUX_SPAWNED], 1u);
}
