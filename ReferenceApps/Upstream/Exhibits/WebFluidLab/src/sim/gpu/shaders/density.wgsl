// Pass 2/4 — SPH density estimation (Poly6 kernel) over the 27 neighbouring
// grid cells. Writes density into particle.velocity.w as a scratch slot.

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  let p = particles[i];
  let h = params.p0.y;
  let cc = cellCoord(p.position.xyz);
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  let nz = i32(params.gridDims.z);
  var density = 0.0;

  for (var dz = -1; dz <= 1; dz = dz + 1) {
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        let cx = cc.x + dx;
        let cy = cc.y + dy;
        let cz = cc.z + dz;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) {
          continue;
        }
        let cell = cellIndex(vec3<i32>(cx, cy, cz));
        let cnt = min(atomicLoad(&gridCount[cell]), MAX_PER_CELL);
        for (var k = 0u; k < cnt; k = k + 1u) {
          let j = gridCells[cell * MAX_PER_CELL + k];
          let pj = particles[j];
          let rij = p.position.xyz - pj.position.xyz;
          let r2 = dot(rij, rij);
          if (r2 < h * h) {
            let mj = materials[u32(pj.props.x)];
            let massJ = mj.a.x * params.counts.w;
            density = density + massJ * poly6(r2, h);
          }
        }
      }
    }
  }

  particles[i].velocity.w = max(density, 1.0);
}
