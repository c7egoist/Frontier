// Feeds the 3D layer: breaking crests near the camera push water up into the MPM box.
// This is the other half of the mass cycle (see mpm/mpm.wgsl::g2p for the return trip).

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "swe/swe_layer.wgsl"

const AUX_HEAD: u32 = 0u;
const AUX_TAIL: u32 = 1u;
const AUX_QUEUE: u32 = 8u;
const QUEUE_ENTRIES: u32 = 4096u;
const QUEUE_MASK: u32 = 4095u;
const QUEUE_POS_SCALE: f32 = 32.0;
const QUEUE_VEL_SCALE: f32 = 32.0;
const QUEUE_BIAS: f32 = 65536.0;

@group(1) @binding(0) var<storage, read>       particles: array<SweParticle>;
@group(1) @binding(1) var<storage, read_write> mpmAux:    array<atomic<u32>>;

@compute @workgroup_size(64)
fn spawnFromCrests(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.sweCount) { return; }
  let p = particles[gid.x];
  let breaking = p.posH.w;
  if (breaking < P.mpmSpawnBreaking) { return; }

  let rel = p.posH.xy - P.cameraPos.xz;
  if (dot(rel, rel) > P.mpmActiveRadius * P.mpmActiveRadius) { return; }

  var seed = gid.x * 747796405u ^ (P.frame * 2246822519u) ^ P.seed;
  if (randStep(&seed) > P.mpmSpawnRate * breaking) { return; }

  let head = atomicLoad(&mpmAux[AUX_HEAD]);
  let tail = atomicLoad(&mpmAux[AUX_TAIL]);
  if (head - tail + 1u >= QUEUE_ENTRIES) { return; }
  let idx = atomicAdd(&mpmAux[AUX_HEAD], 1u);

  let slot = AUX_QUEUE + (idx & QUEUE_MASK) * 4u;
  // Positions are stored relative to the camera: the 3D box follows the camera, so this keeps
  // the fixed-point range small.
  atomicStore(&mpmAux[slot], u32(clamp((rel.x + QUEUE_BIAS) * QUEUE_POS_SCALE, 0.0, 4.0e9)));
  atomicStore(&mpmAux[slot + 1u], u32(clamp((rel.y + QUEUE_BIAS) * QUEUE_POS_SCALE, 0.0, 4.0e9)));
  atomicStore(&mpmAux[slot + 2u], u32(clamp((p.velV.x + QUEUE_BIAS) * QUEUE_VEL_SCALE, 0.0, 4.0e9)));
  atomicStore(&mpmAux[slot + 3u], u32(clamp((p.velV.y + QUEUE_BIAS) * QUEUE_VEL_SCALE, 0.0, 4.0e9)));
}
