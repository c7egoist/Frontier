// Exclusive prefix scan over the per-cell counts. Three dispatches:
//   scanBlocks : per-block Hillis-Steele scan (BLOCK*2 elements per workgroup) + block totals
//   scanTop    : one workgroup scans the block totals
//   scanAdd    : add block offsets, mirror the result into `cursor`, close the range array
//
// cellStart has cells+1 entries, so a cell's slice is (cellStart[c], cellStart[c+1]) with no
// extra lookup (that matters: the neighbour loop does this 9 times per particle).
// `blockOffset` is allocated with one spare entry (index nBlocks) for the grand total.

#pragma once

#include "common/globals.wgsl"
#include "swe/swe_layer.wgsl"

const BLOCK: u32 = 256u;

@group(1) @binding(0) var<storage, read_write> cellCount:   array<u32>;
@group(1) @binding(1) var<storage, read_write> blockSums:   array<u32>;
@group(1) @binding(2) var<storage, read_write> blockOffset: array<u32>;
@group(1) @binding(3) var<storage, read_write> cellStart:   array<u32>;
@group(1) @binding(4) var<storage, read_write> cursor:      array<u32>;

var<workgroup> temp: array<u32, BLOCK>;

/// Inclusive Hillis-Steele scan of `value` across the workgroup; returns the exclusive prefix.
fn blockScan(tid: u32, value: u32) -> u32 {
  temp[tid] = value;
  workgroupBarrier();
  var offset = 1u;
  loop {
    if (offset >= BLOCK) { break; }
    var v = 0u;
    if (tid >= offset) { v = temp[tid - offset]; }
    workgroupBarrier();
    temp[tid] = temp[tid] + v;
    workgroupBarrier();
    offset = offset * 2u;
  }
  let inclusive = temp[tid];
  return inclusive - value;
}

@compute @workgroup_size(BLOCK)
fn scanBlocks(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let cells = lGridW() * lGridH();
  let base = wid.x * BLOCK * 2u;
  let tid = lid.x;
  let i0 = base + tid;
  let i1 = base + BLOCK + tid;
  let v0 = select(0u, cellCount[i0], i0 < cells);
  let v1 = select(0u, cellCount[i1], i1 < cells);

  let e0 = blockScan(tid, v0 + v1);
  let total = temp[BLOCK - 1u];
  if (tid == 0u) { blockSums[wid.x] = total; }
  if (i0 < cells) { cellStart[i0] = e0; }
  if (i1 < cells) { cellStart[i1] = e0 + v0; }
}

@compute @workgroup_size(BLOCK)
fn scanTop(@builtin(local_invocation_id) lid: vec3<u32>) {
  let nBlocks = (lGridW() * lGridH() + BLOCK * 2u - 1u) / (BLOCK * 2u);
  let tid = lid.x;
  var running = 0u;
  var b = 0u;
  loop {
    if (b >= nBlocks) { break; }
    let idx = b + tid;
    var v = 0u;
    if (idx < nBlocks) { v = blockSums[idx]; }
    let off = blockScan(tid, v);
    if (idx < nBlocks) { blockOffset[idx] = running + off; }
    running = running + temp[BLOCK - 1u];
    b = b + BLOCK;
    // `running` read temp[BLOCK-1] which the next iteration overwrites: sync before looping.
    workgroupBarrier();
  }
  if (tid == 0u) { blockOffset[nBlocks] = running; }
}

@compute @workgroup_size(BLOCK)
fn scanAdd(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let cells = lGridW() * lGridH();
  let base = wid.x * BLOCK * 2u;
  let tid = lid.x;
  let off = blockOffset[wid.x];
  let i0 = base + tid;
  let i1 = base + BLOCK + tid;
  if (i0 < cells) { let v = cellStart[i0] + off; cellStart[i0] = v; cursor[i0] = v; }
  if (i1 < cells) { let v = cellStart[i1] + off; cellStart[i1] = v; cursor[i1] = v; }
  if (wid.x == ng.x - 1u && tid == 0u) { cellStart[cells] = blockOffset[ng.x]; }
}
