// Spatial hash for the 2D shallow-water particle layers.
//
// Fixed-radius neighbour search implemented as a *counting sort* (Hoetzlein, GTC 2014):
//   clear -> count -> scan (swe_scan.wgsl) -> scatter
// Counting sort keeps memory proportional to the particle count (the sorted index list is reused
// by the height splat and the foam advection) instead of a fixed-capacity bucket grid.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "swe/swe_layer.wgsl"

@group(1) @binding(0) var<storage, read>       particles:    array<SweParticle>;
@group(1) @binding(1) var<storage, read_write> cellCount:    array<u32>;
@group(1) @binding(2) var<storage, read_write> cursor:       array<u32>;
@group(1) @binding(3) var<storage, read_write> particleIndex: array<u32>;

// ---------------------------------------------------------------------------
// clear: zero the per-cell counters (4 bytes per cell, negligible)
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cells = lGridW() * lGridH();
  if (gid.x >= cells) { return; }
  cellCount[gid.x] = 0u;
  cursor[gid.x] = 0u;
}

// ---------------------------------------------------------------------------
// count: one atomic per particle
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn count(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= lCount()) { return; }
  let c = cellCoordOf(particles[gid.x].posH.xy);
  atomicAdd(&cellCount[cellLinearOf(c)], 1u);
}

// ---------------------------------------------------------------------------
// scatter: append the particle index into its cell's slice
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= lCount()) { return; }
  let c = cellCoordOf(particles[gid.x].posH.xy);
  let cell = cellLinearOf(c);
  let slot = atomicAdd(&cursor[cell], 1u);
  particleIndex[slot] = gid.x;
}
