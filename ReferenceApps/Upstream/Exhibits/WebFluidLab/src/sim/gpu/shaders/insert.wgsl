// Pass 1/4 — scatter every active particle into a fixed-capacity uniform
// grid using an atomic bucket counter (no sort / prefix-sum required).

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  let pos = particles[i].position.xyz;
  let cc = cellCoord(pos);
  let cell = cellIndex(cc);
  let slot = atomicAdd(&gridCount[cell], 1u);
  if (slot < MAX_PER_CELL) {
    gridCells[cell * MAX_PER_CELL + slot] = i;
  }
}
