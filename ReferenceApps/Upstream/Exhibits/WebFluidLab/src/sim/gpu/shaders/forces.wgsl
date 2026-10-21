// Pass 3/4 — pressure (Tait equation of state), viscosity and short-range
// cohesion forces, plus gravity. Writes total acceleration into particle.accel.

const TAIT_GAMMA : f32 = 7.0;

fn taitPressure(density: f32, restDensity: f32, stiffness: f32) -> f32 {
  let ratio = density / restDensity;
  let p = stiffness * (pow(ratio, TAIT_GAMMA) - 1.0);
  return max(p, 0.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  let p = particles[i];
  let mat = materials[u32(p.props.x)];
  let h = params.p0.y;
  let densI = max(p.velocity.w, 1.0);
  let pressI = taitPressure(densI, mat.a.x, mat.a.y);

  let cc = cellCoord(p.position.xyz);
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  let nz = i32(params.gridDims.z);

  var pforce = vec3<f32>(0.0, 0.0, 0.0);
  var vforce = vec3<f32>(0.0, 0.0, 0.0);
  var cforce = vec3<f32>(0.0, 0.0, 0.0);

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
          if (j == i) {
            continue;
          }
          let pj = particles[j];
          let rij = p.position.xyz - pj.position.xyz;
          let r2 = dot(rij, rij);
          if (r2 >= h * h || r2 <= 1e-10) {
            continue;
          }
          let r = sqrt(r2);
          let mj = materials[u32(pj.props.x)];
          let massJ = mj.a.x * params.counts.w;
          let densJ = max(pj.velocity.w, 1.0);
          let pressJ = taitPressure(densJ, mj.a.x, mj.a.y);

          let grad = spikyGrad(rij, r, h);
          pforce = pforce - massJ * (pressI / (densI * densI) + pressJ / (densJ * densJ)) * grad;

          let relVel = pj.velocity.xyz - p.velocity.xyz;
          let viscCoeff = (mat.a.z + mj.a.z) * 0.5;
          vforce = vforce + viscCoeff * massJ * (relVel / densJ) * viscLap(r, h);

          let cohCoeff = (mat.a.w + mj.a.w) * 0.5;
          cforce = cforce - cohCoeff * massJ * (rij / r) * cohesionKernel(r, h);
        }
      }
    }
  }

  var accel = pforce + vforce + cforce;
  accel.y = accel.y + params.p0.w;

  let mag = length(accel);
  let maxAccel = 70.0;
  if (mag > maxAccel) {
    accel = accel * (maxAccel / mag);
  }

  particles[i].accel = vec4<f32>(accel, 0.0);
}
